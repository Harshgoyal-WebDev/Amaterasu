# build_p2a.py - exterior room blocks (11) and inverted architecture (06)
import bpy, math
from mathutils import Vector
import ic_lib as L
from ic_lib import MB, W_DARK, W_AGED, W_POL, PAPER, PAPER_LIT, EMIT, BRONZE, METAL
from build_p1c import deck_planks, rafters

def ext_wall(mb, half, y, z0, h, door=False, lit=True):
    """wall along local X from -half..half at line y; exterior = -Y."""
    n=max(1,int(round(2*half/2.0)))
    xs=[-half+2*half*i/n for i in range(n+1)]
    if door:
        xs=[x for x in xs if abs(x)>1.45]+[-1.3,1.3]; xs.sort()
    for x in xs[:-1]: mb.post(x,y,z0,z0+h+0.1,s=0.22)
    mb.box((0,y,z0+0.06),(2*half,0.24,0.12),W_DARK,grain=0)
    mb.box((0,y,z0+h),(2*half+0.5,0.24,0.22),W_DARK,grain=0)
    for zz in (z0+0.95,z0+2.48): mb.box((0,y-0.06,zz),(2*half,0.08,0.12),W_DARK,grain=0)
    for xa,xb in zip(xs[:-1],xs[1:]):
        a=xa+0.11; b=xb-0.11; cx=(a+b)/2; w=b-a
        if w<0.2: continue
        if door and abs(cx)<0.5:
            mb.box((cx,y-0.01,z0+1.27),(w,0.004,2.3),PAPER_LIT if lit else PAPER)
            for i in range(1,6): mb.box((a+w*i/6,y-0.025,z0+1.27),(0.016,0.025,2.3),W_DARK,grain=2)
            for i in range(1,10): mb.box((cx,y-0.025,z0+0.12+2.3*i/10),(w,0.025,0.016),W_DARK,grain=0)
            mb.box((cx,y-0.03,z0+1.27),(0.04,0.03,2.3),W_DARK,grain=2)
            mb.box((cx,y,z0+2.85),(w,0.06,h-2.55),W_AGED,grain=0)
            continue
        mb.box((cx,y,z0+0.53),(w,0.06,0.82),W_AGED,grain=0)
        for i in range(1,int(w/0.25)): mb.box((a+w*i/int(w/0.25),y-0.035,z0+0.53),(0.02,0.012,0.82),W_DARK,grain=2)
        mb.box((cx,y-0.01,z0+1.7),(w,0.004,1.4),PAPER_LIT if lit else PAPER)
        nv=max(2,int(w/0.3)); nh=6
        for i in range(1,nv): mb.box((a+w*i/nv,y-0.025,z0+1.7),(0.016,0.025,1.4),W_DARK,grain=2)
        for i in range(1,nh): mb.box((cx,y-0.025,z0+1.0+1.4*i/nh),(w,0.025,0.016),W_DARK,grain=0)
        mb.box((cx,y,z0+2.85),(w,0.06,h-2.55),W_AGED,grain=0)

def walls_rect(mb, hx, hy, z0, h, door_side=None, lit=True):
    for side,rz,half,off in (('S',0,hx,hy),('E',90,hy,hx),('N',180,hx,hy),('W',270,hy,hx)):
        with mb.at((0,0,0),rz=rz): ext_wall(mb,half,-off,z0,h,door=(side==door_side),lit=lit)
    mb.box((0,0,z0+h+0.12),(2*hx,2*hy,0.06),W_AGED)

def substructure(mb, ex, ey, z0, depth=2.6):
    for x in (-ex+0.12,ex-0.12): mb.box((x,0,z0-0.25),(0.24,2*ey,0.32),W_DARK,grain=1)
    for y in (-ey+0.12,ey-0.12): mb.box((0,y,z0-0.25),(2*ex,0.24,0.32),W_DARK,grain=0)
    for k in range(-3,4): mb.box((0,k*ey/3.5,z0-0.2),(2*ex,0.14,0.22),W_DARK,grain=0)
    pts=[]
    for sx in (-1,1):
        for sy in (-1,1): pts.append((sx*(ex-0.12),sy*(ey-0.12)))
        pts.append((sx*(ex-0.12),0.0))
    for sy in (-1,1): pts.append((0.0,sy*(ey-0.12)))
    for x,y in pts:
        mb.box((x,y,z0-depth/2),(0.24,0.24,depth),W_DARK,grain=2)
        mb.box((x,y,z0-depth-0.05),(0.28,0.28,0.1),METAL)
    zb=z0-depth+0.3
    for x in (-ex+0.12,ex-0.12): mb.box((x,0,zb),(0.16,2*ey,0.2),W_DARK,grain=1)
    for y in (-ey+0.12,ey-0.12): mb.box((0,y,zb),(2*ex,0.16,0.2),W_DARK,grain=0)
    for x,y in pts:
        if abs(x)>0.1:
            sx=1 if x>0 else -1
            mb.beam((x,y,zb+0.1),(x-sx*1.1,y,z0-0.42),0.1,0.12,W_DARK)

def deck_ring(mb, ex, ey, z0, opens_side='S', hx=None):
    deck_planks(mb,-ex,ex,-ey,ey,w=0.24,along='x',m=W_AGED,z=z0,t=0.06)
    # railing on deck edge with 2.4 opening on door side
    pts=[(-ex+0.08,-ey+0.08),(ex-0.08,-ey+0.08),(ex-0.08,ey-0.08),(-ex+0.08,ey-0.08)]
    sides=['S','E','N','W']
    for i,s in enumerate(sides):
        a=Vector(pts[i]+(z0,)); b=Vector(pts[(i+1)%4]+(z0,))
        Ld=(b-a).length; n=max(1,int(round(Ld/2.0)))
        if s==opens_side:
            d=(b-a)/Ld; m=(a+b)/2
            mb.railing(a,m-d*1.3,post_ts=(0.0,1.0),ps=0.12,finial=True)
            mb.railing(m+d*1.3,b,post_ts=(0.0,),ps=0.12,finial=True)
        else:
            mb.railing(a,b,post_ts=tuple(k/n for k in range(0,n)),ps=0.12,finial=True)

def roof_finial(mb, z):
    mb.box((0,0,z+0.12),(0.5,0.5,0.25),W_DARK)
    mb.lathe((0,0,z+0.24),[(0.16,0.0),(0.2,0.08),(0.1,0.3),(0.05,0.6),(0.12,0.7),(0.02,0.95)],8,BRONZE)

def build_block_A():
    name="IC11_RoomBlock_A"
    r=L.asset_root(name,11,{"footprint":"8 x 8 building, 10.4 x 10.4 deck","levels":1,"door":"S (-Y)","deck_top_z":0.0,"roof":"concave hip"})
    mb=MB(1101); h=3.2
    substructure(mb,5.2,5.2,0.0); deck_ring(mb,5.2,5.2,0.0,'S')
    mb.box((0,0,-0.03),(8.1,8.1,0.06),W_AGED)
    walls_rect(mb,4,4,0.0,h,'S')
    rings=[(5.6,5.6,h+0.15),(4.2,4.2,h+0.65),(0.25,0.25,h+3.25)]
    mb.hip(rings,0.15,W_AGED,ridges=W_DARK,ridge_w=0.14); rafters(mb,rings[0],rings[1],0.15)
    roof_finial(mb,h+3.2)
    L.part(r,"Mesh",mb)
    for k,(x,y) in enumerate(((4.9,4.9),(-4.9,4.9),(4.9,-4.9),(-4.9,-4.9))):
        L.inst("IC10_Lantern_Hanging_Hex",r,name+f"__Lantern_{k}",(x,y,h+0.2))
    L.inst("IC10_Lantern_Wall",r,name+"__Lantern_Door",(-1.6,-4.12,1.9),(0,0,180))
    L.socket(r,"S",(0,-5.2,0),(0,0,-90))

def build_block_B():
    name="IC11_RoomBlock_B_TwoStory"
    r=L.asset_root(name,11,{"footprint":"8 x 8 lower, 6 x 6 upper, 10.4 deck","levels":2,"door":"S (-Y)","deck_top_z":0.0})
    mb=MB(1102); h=3.2
    substructure(mb,5.2,5.2,0.0,depth=3.0); deck_ring(mb,5.2,5.2,0.0,'S')
    mb.box((0,0,-0.03),(8.1,8.1,0.06),W_AGED)
    walls_rect(mb,4,4,0.0,h,'S')
    rings=[(5.5,5.5,h+0.15),(4.4,4.4,h+0.5),(3.1,3.1,h+0.95)]
    mb.hip(rings,0.13,W_AGED,ridges=W_DARK,ridge_w=0.12); rafters(mb,rings[0],rings[1],0.13)
    z2=3.8; h2=2.9
    mb.box((0,0,z2-0.1),(6.4,6.4,0.2),W_DARK)
    walls_rect(mb,3,3,z2,h2,None)
    rings2=[(4.5,4.5,z2+h2+0.15),(3.4,3.4,z2+h2+0.55),(0.22,0.22,z2+h2+2.9)]
    mb.hip(rings2,0.14,W_AGED,ridges=W_DARK,ridge_w=0.13); rafters(mb,rings2[0],rings2[1],0.14)
    roof_finial(mb,z2+h2+2.85)
    L.part(r,"Mesh",mb)
    for k,(x,y) in enumerate(((4.8,-4.8),(-4.8,-4.8),(3.9,3.9),(-3.9,3.9))):
        zz=h+0.25 if k<2 else z2+h2+0.2
        L.inst("IC10_Lantern_Hanging_Rect" if k<2 else "IC10_Lantern_Hanging_Hex",r,name+f"__Lantern_{k}",(x,y,zz))
    L.socket(r,"S",(0,-5.2,0),(0,0,-90))

def build_block_C():
    name="IC11_RoomBlock_C_Gabled"
    r=L.asset_root(name,11,{"footprint":"4 x 8 building, deck on +X side","door":"E (+X)","deck_top_z":0.0,"roof":"gable along Y"})
    mb=MB(1103); h=3.2
    with mb.at((0.7,0,0)):
        substructure(mb,2.7,4.5,0.0,depth=2.2)
    deck_planks(mb,-2.0,3.4,-4.5,4.5,w=0.24,along='x',m=W_AGED,z=0.0,t=0.06)
    mb.railing((3.32,-4.42,0),(3.32,-1.3,0),post_ts=(0,0.5,1.0),ps=0.12,finial=True)
    mb.railing((3.32,1.3,0),(3.32,4.42,0),post_ts=(0,0.5,1.0),ps=0.12,finial=True)
    for yy in (-4.42,4.42): mb.railing((2.05,yy,0),(3.32,yy,0),post_ts=(0,),ps=0.12)
    walls_rect(mb,2,4,0.0,h,'E')
    prof=[(3.0,h+0.18),(2.0,h+0.6),(0.0,h+1.9)]
    mb.gable(9.8,prof,0.14,W_AGED,barge=W_DARK)
    for yy in (-4.0,4.0):
        mb.slab([(-2.0,yy,h+0.1),(2.0,yy,h+0.1),(2.0,yy,h+0.55),(0.0,yy,h+1.82),(-2.0,yy,h+0.55)][::(1 if yy>0 else -1)],0.08,W_AGED,grain=(0,0,1))
        for x in (-1.0,0.0,1.0): mb.box((x,yy*1.005,h+0.6),(0.06,0.06,0.9 if x==0 else 0.5),W_DARK,grain=2)
        mb.box((0,yy*1.005,h+0.55),(4.0,0.06,0.08),W_DARK,grain=0)
    L.part(r,"Mesh",mb)
    L.inst("IC10_Lantern_Wall",r,name+"__Lantern_Door_A",(2.12,-1.6,1.9),(0,0,-90))
    L.inst("IC10_Lantern_Wall",r,name+"__Lantern_Door_B",(2.12,1.6,1.9),(0,0,-90))
    L.inst("IC10_Lantern_Hanging_Rect",r,name+"__Lantern_Eave",(2.9,0.0,h+0.2))
    L.socket(r,"E",(3.4,0,0),(0,0,0))

# ---------------- inverted / reoriented ----------------
INV=[("IC06_Inverted_Staircase_Full","IC05_Staircase_Full",(0,180,0),"upside down: hangs below origin (origin = ceiling plane)"),
     ("IC06_Inverted_Staircase_Half","IC05_Staircase_Half",(0,180,0),"upside down"),
     ("IC06_Inverted_TatamiRoom_A","IC03_TatamiRoom_A",(0,180,0),"room hangs from ceiling plane, floor up"),
     ("IC06_Inverted_Corridor_A","IC04_Corridor_Straight_A",(0,180,0),"corridor on ceiling"),
     ("IC06_Inverted_Bridge_Straight","IC07_Bridge_Straight",(0,180,0),"bridge on ceiling"),
     ("IC06_Inverted_Balcony_Square","IC08_Balcony_Square",(0,180,0),"balcony on ceiling, stilts rise up"),
     ("IC06_Inverted_RoomBlock_A","IC11_RoomBlock_A",(0,180,0),"exterior building hanging upside down"),
     ("IC06_Wall_Staircase_Full","IC05_Staircase_Full",(0,-90,0),"rotated 90: climbs along a wall plane (origin = wall)"),
     ("IC06_Wall_Corridor_A","IC04_Corridor_Straight_A",(0,-90,0),"corridor running on a wall"),
     ("IC06_Wall_Bridge_Straight","IC07_Bridge_Straight",(0,-90,0),"bridge on a wall")]
def build_inverted():
    for name,src,rt,note in INV:
        r=L.asset_root(name,6,{"source_asset":src,"transform":f"child rotation {rt}","note":note,"mesh_data":"linked (shared) with source"})
        L.inst(src,r,name+"__Geo",(0,0,0),rt)
        L.socket(r,"Mount",(0,0,0),(0,90 if rt[1]==180 else 0,0))

def run():
    build_block_A(); build_block_B(); build_block_C(); build_inverted()
