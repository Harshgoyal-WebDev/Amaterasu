# export_glb.py - production GLB exports (library scene only; presentation collection 90 and reference 00 excluded)
import bpy, os, shutil
import ic_lib as L

def _objs(cats):
    out=[]
    for i in cats: out+=list(bpy.data.collections[L.COLLS[i]].all_objects)
    return out

def export(path, cats):
    props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    bpy.ops.object.select_all(action='DESELECT')
    big=[bpy.data.objects[n] for n in ("IC12_Central_Abyss_Cluster","IC13_Infinite_Crossroads")]
    saved={o.name:o.location.copy() for o in big}
    try:
        for o in big: o.location=(0,0,0)          # compositions export centred on origin
        for o in _objs(cats): o.select_set(True)
        kw=dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_extras=True,
                export_cameras=False, export_lights=False, export_yup=True, export_texcoords=True, export_normals=True,
                export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82)
        bpy.ops.export_scene.gltf(**{k:v for k,v in kw.items() if k in props or k=='filepath'})
    finally:
        for o in big: o.location=saved[o.name]
        bpy.ops.object.select_all(action='DESELECT')

def run(public_dir=None):
    bpy.context.window.scene=bpy.data.scenes["IC_Library"]
    os.makedirs(L.EXPORT_DIR, exist_ok=True)
    files=[]
    for i,nm in L.EXPORT_NAMES.items():
        p=os.path.join(L.EXPORT_DIR,nm+".glb"); export(p,[i]); files.append(p)
    p=os.path.join(L.EXPORT_DIR,"infinity_castle_asset_library.glb"); export(p,range(1,21)); files.append(p)
    if public_dir:
        os.makedirs(public_dir, exist_ok=True)
        for f in files: shutil.copy2(f, os.path.join(public_dir, os.path.basename(f)))
    return files
