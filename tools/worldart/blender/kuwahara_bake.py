"""Blender の合成の Kuwahara（絵筆のぼかし）を、アセットと地面の絵に焼き込む。形は変えない。

画面に毎回掛けるのではなく、絵の側を一度だけ塗り直す試し（M-0178）。透明の所（アルファ）は元のまま残す。
GLB は中の絵をすべて塗り直して書き出し、PNG はそのまま塗り直す。

使い方: blender --background --python kuwahara_bake.py -- --out 出力フォルダ [--size 6] [--variation ANISOTROPIC] 入力.glb|入力.png ...
"""
import argparse
import os
import sys
import tempfile

import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--out", required=True)
parser.add_argument("--size", type=int, default=6)
parser.add_argument("--variation", default="ANISOTROPIC", choices=["CLASSIC", "ANISOTROPIC"])
parser.add_argument("inputs", nargs="+")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
os.makedirs(args.out, exist_ok=True)
work = tempfile.mkdtemp(prefix="kuw_")


def filter_file(source, target):
    """PNG を Kuwahara に通して保存する。アルファは元の値に戻す。"""
    scene = bpy.data.scenes.new("kuw")
    bpy.context.window.scene = scene if bpy.context.window else scene
    image = bpy.data.images.load(source)
    width, height = image.size
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = target
    scene.view_settings.view_transform = "Standard"
    camera = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.use_nodes = True
    tree = scene.node_tree
    tree.nodes.clear()
    node_in = tree.nodes.new("CompositorNodeImage")
    node_in.image = image
    kuw = tree.nodes.new("CompositorNodeKuwahara")
    kuw.variation = args.variation
    kuw.inputs["Size"].default_value = args.size
    out = tree.nodes.new("CompositorNodeComposite")
    tree.links.new(node_in.outputs["Image"], kuw.inputs["Image"])
    tree.links.new(kuw.outputs["Image"], out.inputs["Image"])
    bpy.ops.render.render(write_still=True, scene=scene.name)
    # アルファを元へ戻す（切り抜きの形は変えない）
    result = bpy.data.images.load(target)
    original = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    filtered = np.array(result.pixels[:], dtype=np.float32).reshape(height, width, 4)
    filtered[..., 3] = original[..., 3]
    result.pixels[:] = filtered.ravel()
    result.filepath_raw = target
    result.file_format = "PNG"
    result.save()
    bpy.data.images.remove(result)
    bpy.data.images.remove(image)
    bpy.data.objects.remove(camera)
    bpy.data.scenes.remove(scene)


for source in args.inputs:
    name = os.path.basename(source)
    if source.lower().endswith(".png"):
        filter_file(source, os.path.join(args.out, name))
        print("WROTE", name)
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    for index, image in enumerate(list(bpy.data.images)):
        if image.size[0] == 0:
            continue
        raw = os.path.join(work, f"{index}_in.png")
        done = os.path.join(work, f"{index}_out.png")
        image.filepath_raw = raw
        image.file_format = "PNG"
        image.save()
        filter_file(raw, done)
        # 塗り直した画素を元の絵へ写して詰め直す（読み直すと詰めた元の絵が残る）
        result = bpy.data.images.load(done)
        image.pixels[:] = result.pixels[:]
        image.update()
        image.pack()
        bpy.data.images.remove(result)
    bpy.ops.export_scene.gltf(filepath=os.path.join(args.out, name), export_format="GLB", export_normals=True,
                              export_texcoords=True, export_materials="EXPORT", export_vertex_color="ACTIVE",
                              export_apply=False)
    print("WROTE", name)
