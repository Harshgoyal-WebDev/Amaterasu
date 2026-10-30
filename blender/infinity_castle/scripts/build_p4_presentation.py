# build_p4_presentation.py - reference board, presentation scene, vignettes, cameras, lights
import bpy, math
from mathutils import Vector
import ic_lib as L
from ic_lib import MB

def look_at(ob, target):
    d=Vector(target)-ob.location
    ob.rotation_euler=d.to_track_quat('-Z','Y').to_euler()

def reference_board():
    c=L.coll(0)
    for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    r=L.empty("REF_Board",c,None,(-40,40,0),(0,0,0),'PLAIN_AXES',1.0,
        {"reference_image":"Infinity_Castle_3D_Asset_Reference_Sheet.png (attach as image empty here if desired)",
         "palette":"#E8761A amber, #4A2A18 walnut, #3A2216 cedar, #2A1B14 dark brown, #5A4232 aged, #E2C9A8 ivory"})
    pal=[(0.91,0.46,0.10),(0.29,0.165,0.094),(0.227,0.133,0.086),(0.165,0.106,0.078),(0.353,0.259,0.196),(0.886,0.788,0.659)]
    for i,col in enumerate(pal):
        m=bpy.data.materials.get(f"REF_Swatch_{i}") or bpy.data.materials.new(f"REF_Swatch_{i}")
        m.diffuse_color=(*col,1); m.use_nodes=True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(*col,1)
        mb=MB(i); mb.box((i*1.2,0,0.5),(1.0,0.05,1.0),m.name)
        L.mk(f"REF_Swatch_{i}",mb,c,r)
    for k,name in enumerate(["M_Wood_Dark_Cedar","M_Wood_Aged_Brown","M_Wood_Polished","M_Shoji_Paper","M_Tatami","M_Dark_Metal",
                             "M_Lantern_Paper","M_Lantern_Amber_Emissive","M_Decorative_Bronze","M_Background_Dark","M_Shoji_Paper_Glow","M_Fabric_Banner"]):
        mb=MB(50+k); mb.lathe((0,0,0),[(0.45,0.0),(0.45,0.9)],24,name) if k%2 else mb.box((0,0,0.45),(0.9,0.9,0.9),name)
        L.mk(f"REF_MaterialBall_{name}",mb,c,r,loc=((k%6)*1.3,-2.0-(k//6)*1.3,0))

def wm(o):
    m=o.matrix_basis.copy()
    while o.parent:
        o=o.parent; m=o.matrix_basis@m
    return m

def vignette(name, loc):
    return L.empty("PRES_"+name, L.coll(90), None, loc, (0,0,0), 'PLAIN_AXES', 1.0)

def run():
    reference_board()
    lib=bpy.data.scenes["IC_Library"]
    c90=L.coll(90)
    if c90.name in lib.collection.children: lib.collection.children.unlink(c90)
    for o in list(c90.objects): bpy.data.objects.remove(o, do_unlink=True)
    pres=bpy.data.scenes.get("IC_Presentation") or bpy.data.scenes.new("IC_Presentation")
    for i in range(1,21):
        c=bpy.data.collections[L.COLLS[i]]
        if c.name not in pres.collection.children: pres.collection.children.link(c)
    if c90.name not in pres.collection.children: pres.collection.children.link(c90)
    # ---- vignettes (presentation only, instanced from library assets)
    v=vignette("Corridor_Run",(-60,0,0))
    for k,src in enumerate(["IC04_Corridor_Straight_A","IC04_Corridor_Straight_C","IC04_Corridor_Straight_A","IC04_Corridor_Straight_B","IC04_Corridor_Straight_A"]):
        L.inst(src,v,f"PRES_Corridor_{k}",(0,4*k,0))
    L.inst("IC03_TatamiRoom_A",v,"PRES_Corridor_EndRoom",(0,24,0))
    v=vignette("Bridge_Balcony",(-60,-60,0))
    L.inst("IC08_Balcony_Square_Through",v,"PRES_BB_Balcony_A",(0,0,0))
    for k in range(3): L.inst("IC07_Bridge_Straight_Lantern" if k==1 else "IC07_Bridge_Straight",v,f"PRES_BB_Bridge_{k}",(0,4+4*k,0))
    L.inst("IC08_Balcony_Rect",v,"PRES_BB_Balcony_B",(0,16,0))
    L.inst("IC05_Staircase_Half",v,"PRES_BB_Stair",(0,-4,-1.8))
    v=vignette("Inverted",(-60,-110,0))
    L.inst("IC03_TatamiRoom_B",v,"PRES_INV_Room",(0,0,0))
    L.inst("IC06_Inverted_TatamiRoom_A",v,"PRES_INV_RoomInv",(0,0,12.0))
    L.inst("IC05_Staircase_Full",v,"PRES_INV_Stair",(0,4,0))
    L.inst("IC06_Inverted_Staircase_Full",v,"PRES_INV_StairInv",(-2.8,4,12.0))
    L.inst("IC06_Wall_Staircase_Full",v,"PRES_INV_StairWall",(-8.0,-4,0.0),(0,0,0))
    # ---- presentation floor for showcase rows (not exported)
    mb=MB(9001); mb.box((60,-110,-4.3),(200,280,0.2),"M_Background_Dark"); L.mk("PRES_Showcase_Floor",mb,c90)
    # ---- cameras
    def cam(name, loc, target, lens=28):
        cd=bpy.data.cameras.new(name); cd.lens=lens; cd.clip_start=0.05; cd.clip_end=600
        ob=bpy.data.objects.new(name,cd); c90.objects.link(ob); ob.location=loc; look_at(ob,target); return ob
    R=lambda n: bpy.data.objects[n].location.copy()
    g=R("IC01_EntranceGateway"); ra=R("IC03_TatamiRoom_A"); st=R("IC05_Staircase_Full")
    ab=R("IC12_Central_Abyss_Cluster"); cr=R("IC13_Infinite_Crossroads")
    cams=[cam("CAM_01_Entrance_Gateway",g+Vector((3.0,-13.0,1.7)),g+Vector((0,0,3.6)),30),
          cam("CAM_02_Interior_Room",ra+Vector((3.0,-3.2,1.45)),ra+Vector((-2.2,3.2,1.5)),20),
          cam("CAM_03_Corridor",Vector((-60.4,0.4,1.55)),Vector((-60,22,1.4)),24),
          cam("CAM_04_Staircase",st+Vector((6.5,-3.5,3.2)),st+Vector((0,4.5,1.8)),28),
          cam("CAM_05_Inverted_Architecture",Vector((-46,-126,3.0)),Vector((-60,-106,6.0)),22),
          cam("CAM_06_Bridge_Balcony",Vector((-53,-66,2.8)),Vector((-60,-50,0.3)),24),
          cam("CAM_07_Central_Abyss",ab+Vector((3,-5,-2)),ab+Vector((14,14,10)),18),
          cam("CAM_08_Crossroads",cr+Vector((0.4,-16.5,1.6)),cr+Vector((0,0,2.2)),22),
          cam("CAM_00_Showcase_Overview",Vector((40,40,45)),Vector((35,-90,-2)),24)]
    pres.camera=cams[0]
    # ---- world + render
    w=bpy.data.worlds.get("IC_World_Presentation") or bpy.data.worlds.new("IC_World_Presentation")
    w.use_nodes=True; nt=w.node_tree; nt.nodes.clear()
    out=nt.nodes.new("ShaderNodeOutputWorld"); bgn=nt.nodes.new("ShaderNodeBackground")
    bgn.inputs["Color"].default_value=(0.006,0.0045,0.0035,1); bgn.inputs["Strength"].default_value=1.0
    vol=nt.nodes.new("ShaderNodeVolumePrincipled"); vol.inputs["Density"].default_value=0.0025
    vol.inputs["Color"].default_value=(1.0,0.75,0.55,1)
    nt.links.new(bgn.outputs[0],out.inputs["Surface"]); nt.links.new(vol.outputs[0],out.inputs["Volume"])
    pres.world=w
    for eng in ("BLENDER_EEVEE","BLENDER_EEVEE_NEXT"):
        try: pres.render.engine=eng; break
        except Exception: pass
    pres.render.resolution_x=1920; pres.render.resolution_y=1080
    try:
        pres.view_settings.view_transform="AgX"; pres.view_settings.look="AgX - Medium High Contrast"
    except Exception: pass
    pres.view_settings.exposure=0.3
    try: pres.eevee.volumetric_end=220.0
    except Exception: pass
    # ---- lights
    def light(name, typ, loc, energy, color=(1.0,0.55,0.22), size=0.15, rot=None):
        ld=bpy.data.lights.new(name,typ); ld.energy=energy; ld.color=color
        if typ=='AREA': ld.size=size
        else: ld.shadow_soft_size=size
        ob=bpy.data.objects.new(name,ld); c90.objects.link(ob); ob.location=loc
        if rot: ob.rotation_euler=rot
        return ob
    light("LGT_Showcase_Key_Amber",'AREA',(60,-80,40),40000,(1.0,0.62,0.32),120,(math.radians(10),0,0))
    light("LGT_Showcase_Rim",'AREA',(60,60,20),12000,(1.0,0.8,0.6),80,(math.radians(-70),0,0))
    bpy.context.view_layer.update()
    keep=[]
    pres_roots=["IC01_EntranceGateway","IC03_TatamiRoom_A","IC03_TatamiRoom_B","IC05_Staircase_Full","PRES_Corridor_Run","PRES_Bridge_Balcony","PRES_Inverted"]
    def desc(o):
        for ch in o.children:
            yield ch; yield from desc(ch)
    for rn in pres_roots:
        for o in desc(bpy.data.objects[rn]):
            if o.get("ic_light_anchor"): keep.append(wm(o).translation.copy())
    for rn,rad in (("IC12_Central_Abyss_Cluster",34),("IC13_Infinite_Crossroads",30)):
        base=bpy.data.objects[rn].location
        for o in desc(bpy.data.objects[rn]):
            if o.get("ic_light_anchor"):
                p=wm(o).translation
                if (p-base).length<rad: keep.append(p.copy())
    for i,p in enumerate(keep): light(f"LGT_Lantern_{i:03d}",'POINT',p,60,(1.0,0.5,0.18),0.12).data.use_shadow=False
    for rn,off,e in (("IC01_EntranceGateway",(0,-6,7),3000),("IC12_Central_Abyss_Cluster",(0,0,30),20000),("IC13_Infinite_Crossroads",(0,0,16),6000)):
        light(f"LGT_Fill_{rn}",'AREA',bpy.data.objects[rn].location+Vector(off),e,(1.0,0.6,0.3),12)
    return len(keep)
