# build_p1b.py - tatami rooms (03), corridors (04), staircases (05)
import bpy, math
from mathutils import Vector
import ic_lib as L
from ic_lib import MB, W_DARK, W_AGED, W_POL, PAPER, PAPER_LIT, EMIT, TATAMI, FABRIC, BRONZE, METAL

SIDE_RZ={'S':0,'E':90,'N':180,'W':270}
def to_world(side, x, y):
    a=math.radians(SIDE_RZ[side]); return (x*math.cos(a)-y*math.sin(a), x*math.sin(a)+y*math.cos(a))
LEAF={"grid":"IC02_ShojiLeaf_Grid_1200","lit":"IC02_ShojiLeaf_Grid_1200_Lit","koshi":"IC02_ShojiLeaf_Koshi_1200",
      "lit950":"IC02_ShojiLeaf_Fine_950_Lit","yoko":"IC02_ShojiLeaf_Yoko_1200"}
def leaf(root, name, kind, side, x, y, z=0.0, movable=True):
    wx,wy=to_world(side,x,y)
    ob=L.inst(LEAF[kind], root, root.name+"__"+name, (wx,wy,z), (0,0,SIDE_RZ[side]))
    if movable: ob["ic_movable"]="slide_x"; ob["slide_distance"]=1.2 if "950" not in kind else 0.95
    return ob

def wood_panel(mb, x0, x1, z0, z1, y, board=0.2, t=0.03, rails=(0.9,1.8)):
    n=max(1,int(round((x1-x0)/board))); bw=(x1-x0)/n
    for i in range(n): mb.box((x0+bw*(i+0.5),y,(z0+z1)/2),(bw-0.004,t,z1-z0),W_AGED,grain=2)
    for zr in rails: mb.box(((x0+x1)/2,y+0.025,zr),(x1-x0,0.02,0.06),W_DARK,grain=0)
    mb.box(((x0+x1)/2,y+0.03,z0+0.05),(x1-x0,0.02,0.1),W_DARK,grain=0)

def ranma(mb, x0, x1, z0, z1, y, lit=True, step=0.12):
    mb.box(((x0+x1)/2,y-0.015,(z0+z1)/2),(x1-x0,0.003,z1-z0),PAPER_LIT if lit else W_AGED)
    n=max(2,int((x1-x0)/step))
    for i in range(1,n): mb.box((x0+(x1-x0)*i/n,y,(z0+z1)/2),(0.014,0.02,z1-z0),W_DARK,grain=2)
    mb.box(((x0+x1)/2,y,(z0+z1)/2),(x1-x0,0.02,0.014),W_DARK,grain=0)

# ---------------- TATAMI ROOM (8 x 8, centred) ----------------
def room_shell(mb, var, solid_bays=()):
    mb.box((0,0,-0.13),(8.0,8.0,0.15),W_AGED)
    for i in range(4):
        for j in range(4):
            cx=-3.8+0.95+1.9*i; cy=-3.8+0.95+1.9*j
            if (i+j)%2==0:
                for k in (-1,1): mb.box((cx,cy+k*0.475,-0.0275),(1.896,0.946,0.055),TATAMI,fit=True)
            else:
                for k in (-1,1): mb.box((cx+k*0.475,cy,-0.0275),(0.946,1.896,0.055),TATAMI,fit=True)
    for side,rz in SIDE_RZ.items():
        with mb.at((0,0,0),rz=rz):
            mb.post(-3.9,-3.9,-0.055,3.4)
            for x in (-1.3,1.3): mb.post(x,-3.9,-0.055,3.4)
            mb.box((0,-3.9,-0.0275),(7.6,0.2,0.055),W_POL,grain=0)
            for yy in (-3.935,-3.865): mb.box((0,yy,0.003),(7.6,0.012,0.006),W_POL,grain=0)
            mb.box((0,-3.9,2.46),(7.6,0.14,0.12),W_DARK,grain=0)
            mb.box((0,-3.785,2.6),(7.6,0.05,0.12),W_DARK,grain=0)
            for (x0,x1) in ((-3.8,-1.4),(-1.2,1.2),(1.4,3.8)):
                ranma(mb,x0,x1,2.66,2.97,-3.9,lit=(var=="A"))
            mb.box((0,-3.775,3.0),(7.6,0.06,0.06),W_DARK,grain=0)
            mb.box((0,-3.96,3.19),(8.0,0.08,0.42),W_AGED,grain=0)
            for bi,(x0,x1) in enumerate(((-3.8,-1.4),(1.4,3.8))):
                if var=="B" or (side,bi) in solid_bays:
                    wood_panel(mb,x0,x1,0.0,2.4,-3.93)
    mb.box((0,0,3.08),(7.6,7.6,0.02),W_AGED)
    for k in range(17): mb.box((0,-3.6+0.45*k,3.05),(7.6,0.035,0.035),W_DARK,grain=0)
    if var=="A":
        for y in (-1.3,1.3): mb.box((0,y,2.93),(7.8,0.2,0.26),W_DARK,grain=0)
    else:
        mb.box((0,0,2.92),(0.24,7.8,0.3),W_DARK,grain=1)
        for x in (-2.6,2.6): mb.box((x,0,2.95),(0.18,7.8,0.22),W_DARK,grain=1)
    mb.box((0,0,3.35),(8.0,8.0,0.1),W_AGED)

def alcove(mb):
    """tokonoma in local south-frame bay x 1.4..3.8 (used with N side rotation)"""
    mb.box((2.6,-3.45,0.06),(2.4,0.7,0.12),W_POL,grain=0)
    mb.box((2.6,-3.12,2.1),(2.4,0.07,0.1),W_DARK,grain=0)
    mb.box((1.47,-3.15,1.05),(0.13,0.13,2.1),W_AGED,grain=2)
    mb.box((2.6,-3.835,1.35),(0.55,0.008,1.25),FABRIC,grain=2)
    mb.tube((2.29,-3.83,2.0),(2.91,-3.83,2.0),0.012,8,W_DARK)
    mb.tube((2.27,-3.83,0.72),(2.93,-3.83,0.72),0.016,8,W_DARK)
    for x in (2.25,2.95): mb.lathe((x,-3.83,0.72),[(0.02,-0.02),(0.02,0.02)],8,BRONZE,R=L.rot(0,90,0))
    mb.tube((2.6,-3.84,2.0),(2.6,-3.84,2.3),0.003,4,METAL)

def build_room(var):
    name=f"IC03_TatamiRoom_{var}"
    r=L.asset_root(name,3,{"footprint":"8 x 8 m centred","floor_top_z":0.0,"clear_height":3.0,"stack_height":L.STORY,
        "openings":"2.4 m centred door bay on N/S/E/W walls","variant":var})
    mb=MB(300+ord(var))
    solid=(('N',1),) if var=="A" else ()
    room_shell(mb,var,solid)
    if var=="A":
        with mb.at((0,0,0),rz=180): alcove(mb)
    L.part(r,"Shell",mb)
    for side in SIDE_RZ:
        if var=="A":
            for bi,(x0,x1) in enumerate(((-3.8,-1.4),(1.4,3.8))):
                if (side,bi) in solid: continue
                leaf(r,f"Wall{side}{bi}a","lit",side,x0,-3.935,movable=False); leaf(r,f"Wall{side}{bi}b","lit",side,x0+1.2,-3.935,movable=False)
            if side in ("N","S"):
                leaf(r,f"Door{side}_L","grid",side,-1.2,-3.865); leaf(r,f"Door{side}_R","grid",side,0.0,-3.865)
            else:
                leaf(r,f"Door{side}_L","grid",side,-2.4,-3.865); leaf(r,f"Door{side}_R","grid",side,1.2,-3.865)
        else:
            leaf(r,f"Door{side}_L","koshi",side,-2.4,-3.865); leaf(r,f"Door{side}_R","koshi",side,1.2,-3.865)
        wx,wy=to_world(side,0,-4.0); L.socket(r,side,(wx,wy,0.0),(0,0,SIDE_RZ[side]-90))
    if var=="A":
        L.inst("IC10_Lantern_Hanging_Rect",r,name+"__Lantern_Ceiling",(0,0,3.07))
        L.inst("IC10_Lantern_Standing",r,name+"__Lantern_SE",(3.25,-3.25,0))
        L.inst("IC10_Lantern_Standing",r,name+"__Lantern_SW",(-3.25,-3.25,0))
    else:
        L.inst("IC10_Lantern_Hanging_Hex",r,name+"__Lantern_Ceiling",(0,0,2.77))
        for k,(x,y) in enumerate(((3.25,3.25),(-3.25,3.25),(3.25,-3.25),(-3.25,-3.25))):
            L.inst("IC10_Lantern_Standing",r,name+f"__Lantern_{k}",(x,y,0))
    L.socket(r,"LanternCeiling",(0,0,3.07),(0,90,0)); L.socket(r,"StackAbove",(0,0,L.STORY),(0,-90,0))

# ---------------- CORRIDOR (runs +Y, 0..4) ----------------
def build_corridor(var):
    name=f"IC04_Corridor_Straight_{var}"
    r=L.asset_root(name,4,{"length":4.0,"inner_width":3.2,"clear_height":3.0,"tiles_along":"+Y every 4.0 m","variant":var})
    mb=MB(400+ord(var))
    mb.box((0,2,-0.12),(3.4,4.0,0.16),W_AGED)
    for i in range(15): mb.box((-1.5+0.1+0.2*i,2,-0.02),(0.196,4.0,0.04),W_POL,grain=1)
    for sx in (-1,1):
        open_side=(var=="B" and sx==1)
        mb.post(sx*1.6,2.0,-0.04,3.3)
        mb.box((sx*1.6,2,-0.02),(0.2,4.0,0.04),W_POL,grain=1)
        mb.box((sx*1.6,2,3.1),(0.18,4.0,0.2),W_DARK,grain=1)
        if open_side:
            mb.railing((1.56,0,0),(1.56,4,0),post_ts=(),h=0.9,cap_ext=0.0)
            mb.box((1.72,2,-0.1),(0.08,4.0,0.2),W_DARK,grain=1)
        else:
            mb.box((sx*1.6,2,2.46),(0.14,4.0,0.12),W_DARK,grain=1)
            with mb.at((sx*1.6,0,0),rz=90 if sx>0 else -90):
                if var=="C":
                    for (a,b) in ((0,1.9),(2.1,4.0)):
                        aa,bb=(-b,-a) if sx<0 else (a,b)
                        wood_panel(mb,aa,bb,0.0,2.4,0.0)
                for (a,b) in ((0,1.9),(2.1,4.0)):
                    aa,bb=(-b,-a) if sx<0 else (a,b)
                    ranma(mb,aa,bb,2.52,2.99,0.0,lit=(var!="C"))
            mb.box((sx*1.68,2,3.28),(0.04,4.0,0.16),W_AGED,grain=1)
    mb.box((0,2,3.12),(3.4,0.2,0.26),W_DARK,grain=0)
    for y in (1.0,3.0): mb.box((0,y,3.1),(3.2,0.12,0.18),W_DARK,grain=0)
    mb.box((0,2,3.22),(3.4,4.0,0.02),W_AGED)
    for k in range(8): mb.box((-1.4+0.4*k,2,3.195),(0.03,4.0,0.03),W_DARK,grain=1)
    mb.box((0,2,3.35),(3.4,4.0,0.1),W_AGED)
    L.part(r,"Shell",mb)
    # shoji walls (instanced leaves), outer track
    for sx in (-1,1):
        if var=="C" or (var=="B" and sx==1): continue
        for k,y0 in enumerate((0.0,0.95,2.1,3.05)):
            if sx<0: ob=L.inst(LEAF["lit950"],r,f"{name}__WallL{k}",(-1.635,y0+0.95,0),(0,0,-90))
            else:    ob=L.inst(LEAF["lit950"],r,f"{name}__WallR{k}",(1.635,y0,0),(0,0,90))
            ob["ic_movable"]="slide_x"; ob["slide_distance"]=0.95
    if var=="A":
        L.inst("IC10_Lantern_Wall",r,name+"__Lantern_L",(-1.5,2,2.0),(0,0,-90))
        L.inst("IC10_Lantern_Wall",r,name+"__Lantern_R",(1.5,2,2.0),(0,0,90))
    elif var=="B":
        L.inst("IC10_Lantern_Wall",r,name+"__Lantern_L",(-1.5,2,2.0),(0,0,-90))
        L.inst("IC10_Lantern_Hanging_Hex",r,name+"__Lantern_Eave",(1.2,2,2.99))
    else:
        for k,y in enumerate((1.0,3.0)): L.inst("IC10_Lantern_Hanging_Rect",r,name+f"__Lantern_{k}",(0,y,3.01))
    L.socket(r,"Start",(0,0,0),(0,0,-90)); L.socket(r,"End",(0,4,0),(0,0,90))

# ---------------- STAIRCASE (runs +Y) ----------------
def stairs(mb, n, rise=0.15, run=1/3.0, hw=1.25):
    Ls=n*run; H=n*rise; sl=rise/run
    for i in range(n):
        zt=(i+1)*rise; y0=i*run
        mb.box((0,y0+run/2-0.015,zt-0.025),(2.42,run+0.03,0.05),W_AGED,grain=0)
        mb.box((0,y0+0.012,i*rise+(rise-0.05)/2),(2.42,0.024,rise-0.05),W_DARK,grain=0)
    zc=lambda y: sl*y+rise*0.4
    for sx in (-1,1):
        mb.beam((sx*hw,-0.3,zc(-0.3)),(sx*hw,Ls,zc(Ls)),0.08,0.36,W_DARK)
    mb.beam((0,-0.1,zc(-0.1)-0.22),(0,Ls,zc(Ls)-0.22),0.14,0.24,W_DARK)
    zb=lambda y: zc(y)+0.2
    newels=(0.15,Ls/2,Ls-0.15)
    for sx in (-1,1):
        x=sx*hw
        for ny in newels:
            mb.box((x,ny,zb(ny)+0.55-0.1),(0.12,0.12,1.3),W_DARK,grain=2)
        for ny in (newels[0],newels[-1]): L.giboshi(mb,(x,ny,zb(ny)+1.1),0.07)
        mb.beam((x,newels[0],zb(newels[0])+1.0),(x,newels[-1],zb(newels[-1])+1.0),0.1,0.07,W_DARK,ext=0.06)
        mb.beam((x,newels[0],zb(newels[0])+0.55),(x,newels[-1],zb(newels[-1])+0.55),0.06,0.05,W_DARK)
        for i in range(n):
            y=(i+0.5)*run
            if min(abs(y-ny) for ny in newels) < 0.15: continue
            mb.box((x,y,zb(y)+0.5),(0.035,0.035,1.0),W_DARK,grain=2)
    for yy in ((Ls*0.5, Ls-0.6) if n>=18 else (Ls*0.6,)):
        zt=zc(yy)-0.2
        if zt<0.4: continue
        for sx in (-1,1): mb.box((sx*hw,yy,zt/2),(0.16,0.16,zt),W_DARK,grain=2)
        mb.box((0,yy,zt-0.08),(2.66,0.12,0.16),W_DARK,grain=0)
        mb.box((0,yy,0.25),(2.66,0.12,0.12),W_DARK,grain=0)
        mb.beam((-hw,yy,0.3),(hw,yy,zt-0.15),0.08,0.1,W_DARK)

def build_stair(name, n, note):
    run=1/3.0; rise=0.15
    r=L.asset_root(name,5,{"steps":n,"rise_per_step":rise,"tread_run":round(run,4),"total_rise":round(n*rise,3),
        "total_run":round(n*run,3),"clear_width":2.4,"note":note})
    mb=MB(500+n); stairs(mb,n,rise,run)
    L.part(r,"Mesh",mb)
    L.socket(r,"Bottom",(0,0,0),(0,0,-90)); L.socket(r,"Top",(0,n*run,n*rise),(0,0,90))

def run():
    build_room("A"); build_room("B")
    for v in "ABC": build_corridor(v)
    build_stair("IC05_Staircase_Full",24,"one full story (3.6 m) over 8 m run")
    build_stair("IC05_Staircase_Half",12,"half story (1.8 m) over 4 m run")
