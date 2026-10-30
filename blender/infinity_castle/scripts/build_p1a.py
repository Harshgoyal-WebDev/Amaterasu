# build_p1a.py - lanterns (10) and shoji door modules (02)
import bpy, math
from mathutils import Vector
import ic_lib as L
from ic_lib import MB, W_DARK, W_AGED, W_POL, PAPER, PAPER_LIT, EMIT, LPAPER, METAL, BRONZE

def lantern_box(mb, W, z0, z1, bars=2):
    zc=(z0+z1)/2; Hh=z1-z0
    for sx in (-1,1):
        for sy in (-1,1):
            mb.box((sx*(W/2-0.016),sy*(W/2-0.016),zc),(0.032,0.032,Hh+0.05),W_DARK,grain=2)
    for z in (z0+0.015,z1-0.015):
        for sx in (-1,1): mb.box((sx*(W/2-0.016),0,z),(0.036,W,0.03),W_DARK,grain=1)
        for sy in (-1,1): mb.box((0,sy*(W/2-0.016),z),(W,0.036,0.03),W_DARK,grain=0)
    pw=W-0.04; ph=Hh-0.03
    for sx in (-1,1): mb.box((sx*(W/2-0.022),0,zc),(0.004,pw,ph),EMIT)
    for sy in (-1,1): mb.box((0,sy*(W/2-0.022),zc),(pw,0.004,ph),EMIT)
    for sx in (-1,1):
        x=sx*(W/2-0.0135)
        mb.box((x,0,zc),(0.007,0.011,ph),W_DARK,grain=2)
        for k in range(1,bars+1): mb.box((x,0,z0+0.015+ph*k/(bars+1)),(0.007,pw,0.011),W_DARK,grain=1)
    for sy in (-1,1):
        y=sy*(W/2-0.0135)
        mb.box((0,y,zc),(0.011,0.007,ph),W_DARK,grain=2)
        for k in range(1,bars+1): mb.box((0,y,z0+0.015+ph*k/(bars+1)),(pw,0.007,0.011),W_DARK,grain=0)

def build_lanterns():
    c=10
    # 1 hanging rectangular (origin = ceiling hook)
    r=L.asset_root("IC10_Lantern_Hanging_Rect",10,{"mount":"origin = hook point, hangs -Z","size":"0.36 x 0.36 x 1.05"})
    mb=MB(101); z1=-0.42; z0=z1-0.56
    lantern_box(mb,0.36,z0,z1)
    with mb.at((0,0,z1)): mb.hip([(0.25,0.25,0.0),(0.17,0.17,0.06),(0.03,0.03,0.16)],0.018,W_DARK)
    mb.box((0,0,z1+0.165),(0.07,0.07,0.03),W_DARK)
    mb.box((0,0,z0-0.012),(0.38,0.38,0.024),W_DARK)
    mb.lathe((0,0,z0-0.1),[(0.004,0.0),(0.016,0.02),(0.03,0.06),(0.03,0.076)],8,BRONZE)
    mb.tube((0,0,z1+0.17),(0,0,-0.04),0.008,6,METAL)
    mb.lathe((0,0,-0.045),[(0.03,0.0),(0.03,0.045)],8,METAL)
    L.part(r,"Mesh",mb); L.anchor(r,(0,0,(z0+z1)/2))
    # 2 wall mounted (origin = wall surface, projects +Y)
    r=L.asset_root("IC10_Lantern_Wall",10,{"mount":"origin on wall face, lantern projects +Y","size":"0.3 x 0.45 x 0.7"})
    mb=MB(102)
    mb.box((0,0.015,0.0),(0.14,0.03,0.62),W_DARK,grain=2)
    for z in (0.24,-0.24): mb.lathe((0,0.03,z),[(0.018,0.0),(0.018,0.012)],8,BRONZE,R=L.rot(-90,0,0))
    mb.beam((0,0.03,0.24),(0,0.40,0.24),0.05,0.06,W_DARK,ext=0.03)
    mb.beam((0,0.03,-0.04),(0,0.32,0.22),0.035,0.035,W_DARK)
    mb.tube((0,0.33,0.22),(0,0.33,0.14),0.006,6,METAL)
    with mb.at((0,0.33,0)):
        lantern_box(mb,0.26,-0.34,0.06,bars=2)
        with mb.at((0,0,0.06)): mb.hip([(0.19,0.19,0.0),(0.12,0.12,0.04),(0.02,0.02,0.09)],0.015,W_DARK)
        mb.box((0,0,-0.35),(0.28,0.28,0.02),W_DARK)
    L.part(r,"Mesh",mb); L.anchor(r,(0,0.33,-0.14))
    # 3 standing andon (origin = floor)
    r=L.asset_root("IC10_Lantern_Standing",10,{"mount":"origin on floor","size":"0.46 x 0.46 x 1.25"})
    mb=MB(103)
    for sx in (-1,1):
        for sy in (-1,1):
            mb.box((sx*0.2,sy*0.2,0.6),(0.04,0.04,1.2),W_DARK,grain=2)
    for z in (0.1,0.42):
        for sx in (-1,1): mb.box((sx*0.2,0,z),(0.03,0.44,0.03),W_DARK,grain=1)
        for sy in (-1,1): mb.box((0,sy*0.2,z),(0.44,0.03,0.03),W_DARK,grain=0)
    mb.box((0,0,0.42),(0.38,0.38,0.015),W_DARK)
    with mb.at((0,0,0)): lantern_box(mb,0.36,0.44,1.12,bars=3)
    mb.box((0,0,1.19),(0.46,0.46,0.03),W_DARK)
    mb.beam((-0.2,0,1.22),(0.2,0,1.22),0.04,0.04,W_DARK)
    for sx in (-1,1):
        for sy in (-1,1): L.giboshi(mb,(sx*0.2,sy*0.2,1.205),0.02)
    L.part(r,"Mesh",mb); L.anchor(r,(0,0,0.78))
    # 4 hanging hexagonal (rokkaku)
    r=L.asset_root("IC10_Lantern_Hanging_Hex",10,{"mount":"origin = hook point, hangs -Z","size":"0.48 dia x 1.1"})
    mb=MB(104); z1=-0.45; z0=z1-0.5
    mb.lathe((0,0,z0),[(0.175,0.0),(0.175,z1-z0)],6,EMIT,R=L.rot(0,0,30),cap=False)
    for i in range(6):
        a=math.radians(60*i)
        mb.box((0.185*math.cos(a),0.185*math.sin(a),(z0+z1)/2),(0.03,0.03,z1-z0+0.04),W_DARK,R=L.rot(0,0,60*i),grain=2)
    for z in (z0,(z0+z1)/2,z1):
        mb.lathe((0,0,z-0.012),[(0.19,0.0),(0.19,0.024)],6,W_DARK,R=L.rot(0,0,30),cap=False)
    mb.lathe((0,0,z1),[(0.25,0.0),(0.25,0.02),(0.16,0.07),(0.05,0.16),(0.03,0.19)],6,W_DARK,R=L.rot(0,0,30))
    mb.lathe((0,0,z0-0.03),[(0.19,0.0),(0.19,0.03)],6,W_DARK,R=L.rot(0,0,30))
    mb.lathe((0,0,z0-0.12),[(0.004,0.0),(0.02,0.03),(0.035,0.07),(0.035,0.09)],8,BRONZE)
    mb.tube((0,0,z1+0.18),(0,0,-0.04),0.008,6,METAL)
    mb.lathe((0,0,-0.045),[(0.03,0.0),(0.03,0.045)],8,METAL)
    L.part(r,"Mesh",mb); L.anchor(r,(0,0,(z0+z1)/2))

# ---------------- shoji ----------------
PATTERNS={"Grid":(3,7),"Yoko":(1,13),"Tall":(2,3),"Fine":(5,11)}
def shoji_leaf(mb, w, h, pattern="Grid", kick=0.0, lit=False):
    """leaf local: x 0..w, y centred (paper on -Y face), z 0..h"""
    P = PAPER_LIT if lit else PAPER
    st=0.045; tr=0.05; br=0.07; t=0.03
    mb.box((st/2,0,h/2),(st,t,h),W_DARK,grain=2); mb.box((w-st/2,0,h/2),(st,t,h),W_DARK,grain=2)
    mb.box((w/2,0,h-tr/2),(w-2*st,t,tr),W_DARK,grain=0); mb.box((w/2,0,br/2),(w-2*st,t,br),W_DARK,grain=0)
    za=br
    if kick>0:
        mb.box((w/2,0,br+kick/2),(w-2*st,0.014,kick),W_AGED,grain=0)
        for i in range(1,4): mb.box((st+(w-2*st)*i/4,0.009,br+kick/2),(0.012,0.006,kick),W_DARK,grain=2)
        mb.box((w/2,0,br+kick+0.015),(w-2*st,t,0.03),W_DARK,grain=0)
        za=br+kick+0.03
    xa=st; xb=w-st; zb=h-tr
    mb.box(((xa+xb)/2,-0.0095,(za+zb)/2),(xb-xa,0.003,zb-za),P)
    nv,nh=PATTERNS[pattern]
    for i in range(nv): mb.box((xa+(xb-xa)*(i+1)/(nv+1),0.003,(za+zb)/2),(0.012,0.02,zb-za),W_DARK,grain=2)
    for i in range(nh): mb.box(((xa+xb)/2,0.003,za+(zb-za)*(i+1)/(nh+1)),(xb-xa,0.02,0.012),W_DARK,grain=0)

def leaf_asset(name, w, h, pattern, kick=0.0, lit=False):
    r=L.asset_root(name,2,{"leaf_width":w,"leaf_height":h,"pattern":pattern,
        "pivot":"origin = bottom-left edge; slides along local +X/-X","slide_distance":w,"lit_paper":int(lit)})
    mb=MB(L.seed(name)); shoji_leaf(mb,w,h,pattern,kick,lit)
    L.part(r,"Leaf",mb,props={"ic_movable":"slide_x","slide_distance":w})
    return r

def door_frame(mb, clear_w=2.4, h=2.4):
    hw=clear_w/2
    for sx in (-1,1): mb.box((sx*(hw+0.06),0,(h+0.14)/2),(0.12,0.14,h+0.14),W_DARK,grain=2)
    mb.box((0,0,h+0.06),(clear_w+0.24,0.12,0.12),W_DARK,grain=0)           # kamoi
    mb.box((0,0.075,h+0.17),(clear_w+0.36,0.05,0.1),W_DARK,grain=0)        # nageshi
    mb.box((0,0,-0.02),(clear_w+0.24,0.14,0.04),W_POL,grain=0)             # shikii
    for yy in (-0.035,0.035): mb.box((0,yy,0.003),(clear_w,0.012,0.006),W_POL,grain=0)
    # ranma transom lattice above
    mb.box((0,0,h+0.5),(clear_w+0.24,0.1,0.06),W_DARK,grain=0)
    mb.box((0,-0.02,h+0.33),(clear_w,0.003,0.28),PAPER_LIT)
    for i in range(1,12): mb.box((-hw+clear_w*i/12,0.0,h+0.33),(0.014,0.02,0.28),W_DARK,grain=2)

def build_shoji():
    leaves={}
    leaves["Grid"]=leaf_asset("IC02_ShojiLeaf_Grid_1200",1.2,2.4,"Grid")
    leaves["Yoko"]=leaf_asset("IC02_ShojiLeaf_Yoko_1200",1.2,2.4,"Yoko")
    leaves["Kick"]=leaf_asset("IC02_ShojiLeaf_Koshi_1200",1.2,2.4,"Tall",kick=0.45)
    leaves["Lit"]=leaf_asset("IC02_ShojiLeaf_Grid_1200_Lit",1.2,2.4,"Grid",lit=True)
    leaves["Lit950"]=leaf_asset("IC02_ShojiLeaf_Fine_950_Lit",0.95,2.4,"Fine",lit=True)
    leaves["Narrow"]=leaf_asset("IC02_ShojiLeaf_Grid_600",0.6,2.4,"Grid")
    # frames + arrangements
    def arrangement(name, clear_w, configs, note):
        r=L.asset_root(name,2,{"opening_clear_width":clear_w,"opening_height":2.4,"config":note})
        mb=MB(L.seed(name)); door_frame(mb,clear_w)
        L.part(r,"Frame",mb)
        for i,(leaf,x,yy) in enumerate(configs):
            ob=L.inst(leaves[leaf],r,f"{name}__Leaf{i+1}",(x,yy,0))
            ob["ic_movable"]="slide_x"; ob["slide_distance"]=bpy.data.objects[leaves[leaf].name].get("leaf_width",1.2)
        L.socket(r,"Front",(0,-0.1,0),(0,0,-90)); L.socket(r,"Back",(0,0.1,0),(0,0,90))
        return r
    arrangement("IC02_ShojiDoor_Single_Closed",1.2,[("Grid",-0.6,-0.035)],"single leaf, closed")
    arrangement("IC02_ShojiDoor_Single_Open",1.2,[("Grid",0.35,-0.035)],"single leaf, slid open (overlaps wall)")
    arrangement("IC02_ShojiDoor_Double_Closed",2.4,[("Grid",-1.2,-0.035),("Grid",0.0,0.035)],"two leaves, closed")
    arrangement("IC02_ShojiDoor_Double_Open",2.4,[("Grid",-2.15,-0.035),("Grid",0.95,0.035)],"two leaves, slid open")
    arrangement("IC02_ShojiDoor_Double_Koshi",2.4,[("Kick",-1.2,-0.035),("Kick",0.0,0.035)],"two koshi leaves, closed")

def run():
    build_lanterns(); build_shoji()
