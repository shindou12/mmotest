"""Blenderで新旧の画像を切り替える。元のblendファイルは保存しない。"""
import bpy


def install_painted_materials(tree, assets, profile=None):
    profile = profile or {"leaf": "frond-ro-v1.png", "bark": "bark-ro-v1.png"}
    records = []
    for material in tree.data.materials:
        nodes = material.node_tree.nodes
        leafy = material.name.startswith("leaf")
        new_image = bpy.data.images.load(str(assets / profile["leaf" if leafy else "bark"]), check_existing=True)
        for node in list(nodes):
            if node.type != 'TEX_IMAGE':
                continue
            old_vectors = [link.from_socket for link in node.inputs['Vector'].links]
            records.append((material, node, node.image, new_image, old_vectors))
            if not leafy:
                texcoord = nodes.new('ShaderNodeTexCoord')
                scale = nodes.new('ShaderNodeVectorMath')
                scale.operation = 'MULTIPLY'
                scale.inputs[1].default_value = (2, 1, 1)
                material.node_tree.links.new(texcoord.outputs['UV'], scale.inputs[0])
                node['paint_uv_scale'] = scale.name

    def set_painted(enabled):
        for material, node, original, new, old_vectors in records:
            node.image = new if enabled else original
            for link in list(node.inputs['Vector'].links):
                material.node_tree.links.remove(link)
            if enabled and 'paint_uv_scale' in node:
                material.node_tree.links.new(material.node_tree.nodes[node['paint_uv_scale']].outputs[0], node.inputs['Vector'])
            elif not enabled:
                for socket in old_vectors:
                    material.node_tree.links.new(socket, node.inputs['Vector'])
    return set_painted
