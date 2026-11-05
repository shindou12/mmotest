"""GLB の葉の絵だけを差し替えて書き出す。形・UV・法線は変えない。

使い方: blender --background --python leaf_repaint.py -- --in a.glb --image leaf.png --out b.glb
        [--material "Broadleaf painted palette atlas"] [--rename painted_leaf]

材質名に leaf を入れると、ゲームは切り抜きの葉として両面で描く（world.js の fixMaterial）。
"""
import argparse
import sys

import bpy

args = argparse.ArgumentParser()
args.add_argument("--in", dest="source", required=True)
args.add_argument("--image", required=True)
args.add_argument("--out", required=True)
args.add_argument("--material", default="Broadleaf painted palette atlas")
args.add_argument("--rename", default="painted_leaf")
args = args.parse_args(sys.argv[sys.argv.index("--") + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.source)

material = bpy.data.materials[args.material]
image = bpy.data.images.load(args.image)
nodes = [node for node in material.node_tree.nodes if node.type == "TEX_IMAGE"]
if len(nodes) != 1:
    raise SystemExit(f"expected one image node, found {len(nodes)}")
nodes[0].image = image
image.pack()
material.name = args.rename

bpy.ops.export_scene.gltf(
    filepath=args.out,
    export_format="GLB",
    export_normals=True,
    export_texcoords=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_apply=False,
)
print("WROTE", args.out)
