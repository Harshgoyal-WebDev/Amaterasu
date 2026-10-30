# build_p1c.py - bridges (07), balconies (08), timber framework (09), entrance gateway (01)
import bpy, math
from mathutils import Vector
import ic_lib as L
from ic_lib import MB, W_DARK, W_AGED, W_POL, PAPER, PAPER_LIT, EMIT, BRONZE, METAL

# ---------------- BRIDGES ----------------
def deck_planks(mb, x0, x1, y0, y1, w=0.25, along='x', m=W_AGED, z=0.0, t=0.06):
    if along=='x':
        n=max(1,int(round((y1-y0)/w))); s=(y1-y0)/n
        for i in range(n): mb.box(((x0+x1)/2,y0+s*(i+0.5),z-t/2),(x1-x0,s-0.006,t),m,grain=0)
    else:
        n=max(1,int(round((x1-x0)/w))); s=(x1-x0)/n
        for i in range(n): mb.box((x0+s*(i+0.5),(y0+y1)/2,z-t/2),(s-0.006,y1-y0,t),m,grain=1)

def build_bridge_straight(name, Lb=4.0, lantern=False):
    r=L.asset_root(name,7,{"length":Lb,"clear_width":2.4,"deck_top_z":0.0,"tiles_along":"+Y"})
    mb=MB(700+int(Lb)+lantern)
    for sx in (-1,1):
        mb.box((sx*1.1,Lb/2,-0.355),(0.18,Lb,0.35),W_DARK,grain=1)
        mb.box((sx*1.43,Lb/2,-0.08),(0.06,Lb,0.2),W_DARK,grain=1)
        mb.railing((sx*1.3,0,0),(sx*1.3,Lb,0),post_ts=tuple((k+0.5)/(Lb/2) for k in range(int(Lb/2))),cap_ext=0.0)
    for k in range(int(Lb)): mb.box((0,k+0.5,-0.12),(2.9,0.12,0.12),W_DARK,grain=0)
    deck_planks(mb,-1.4,1.4,0,Lb)
    if lantern:
        mb.box((-1.3,Lb/2,1.45),(0.13,0.13,2.9),W_DARK,grain=2)
        mb.beam((-1.3,Lb/2,2.75),(-0.55,Lb/2,2.75),0.09,0.11,W_DARK,ext=0.06)
        mb.beam((-1.3,Lb/2,2.3),(-0.85,Lb/2,2.72),0.06,0.06,W_DARK)
        L.giboshi(mb,(-1.3,Lb/2,2.9),0.08)
    L.part(r,"Mesh",mb)
    if lantern: L.inst("IC10_Lantern_Hanging_Rect",r,name+"__Lantern",(-0.6,Lb/2,2.69))
    L.socket(r,"Start",(0,0,0),(0,0,-90)); L.socket(r,"End",(0,Lb,0),(0,0,90))
    for k in range(int(Lb/2)):
        for sx,s in ((-1,"L"),(1,"R")): L.socket(r,f"LanternMount_{s}{k}",(sx*1.3,1+2*k,1.07),(0,-90,0))

SIDE_OPEN_SPAN={'S':((-2,0),(2,0)),'E':((2,0),(2,4)),'N':((2,4),(-2,4)),'W':((-2,4),(-2,0))}
def edge_railings(mb, opens, x0=-2.0, x1=2.0, y0=0.0, y1=4.0, inset=0.1, ps=0.11, finial=False):
    corners=[(x0+inset,y0+inset),(x1-inset,y0+inset),(x1-inset,y1-inset),(x0+inset,y1-inset)]
    sides=['S','E','N','W']
    for i,s in enumerate(sides):
        a=Vector(corners[i]+(0,)); b=Vector(corners[(i+1)%4]+(0,))
        if s in opens:
            d=(b-a); Ld=d.length; dn=d/Ld; mid=(a+b)/2
            p1=mid-dn*1.3; p2=mid+dn*1.3
            mb.railing(a,p1,post_ts=(1.0,),ps=ps,finial=finial)
            mb.railing(p2,b,post_ts=(0.0,),ps=ps,finial=finial)
        else:
            Ld=(b-a).length; n=max(1,int(round(Ld/2.0)))
            mb.railing(a,b,post_ts=tuple(k/n for k in range(1,n)),ps=ps,finial=finial)

def sockets_for(r, opens, x0=-2.0, x1=2.0, y0=0.0, y1=4.0, z=0.0):
    mid={'S':((0,y0),-90),'N':((0,y1),90),'E':((x1,(y0+y1)/2),0),'W':((x0,(y0+y1)/2),180)}
    for s in opens:
        (x,y),rz=mid[s]; L.socket(r,s,(x,y,z),(0,0,rz))

def build_bridge_junction(name, opens):
    r=L.asset_root(name,7,{"footprint":"4 x 4 (x -2..2, y 0..4)","openings":"".join(opens),"opening_clear_width":2.4})
    mb=MB(710+len(opens))
    for x in (-1.9,-1.1,1.1,1.9): mb.box((x,2,-0.355),(0.18,4.0,0.35),W_DARK,grain=1)
    for y in (0.1,3.9): mb.box((0,y,-0.355),(4.0,0.18,0.35),W_DARK,grain=0)
    for k in range(4): mb.box((0,k+0.5,-0.12),(4.0,0.12,0.12),W_DARK,grain=0)
    deck_planks(mb,-2.0,2.0,0,4)
    for x,y in ((-1.9,0.1),(1.9,0.1),(1.9,3.9),(-1.9,3.9)):
        mb.box((x,y,-0.25),(0.16,0.16,2.6),W_DARK,grain=2)
        L.giboshi(mb,(x,y,1.05),0.09)
    edge_railings(mb,opens)
    L.part(r,"Mesh",mb); sockets_for(r,opens)

# ---------------- BALCONIES ----------------
def build_balcony(name, Ly, opens, lanterns=True):
    r=L.asset_root(name,8,{"footprint":f"4 x {Ly:g} (x -2..2, y 0..{Ly:g})","openings":"".join(opens),"opening_clear_width":2.4,
        "deck_top_z":0.0,"suspended":"stilts hang to z=-2.4"})
    mb=MB(800+int(Ly)+len(opens))
    posts=[(-1.89,0.11),(1.89,0.11),(1.89,Ly-0.11),(-1.89,Ly-0.11)]
    if Ly>4: posts+= [(-1.89,Ly/2),(1.89,Ly/2)]
    for x in (-1.89,1.89): mb.box((x,Ly/2,-0.2),(0.22,Ly,0.3),W_DARK,grain=1)
    for y in (0.11,Ly-0.11): mb.box((0,y,-0.2),(4.0,0.22,0.3),W_DARK,grain=0)
    for x in (-0.7,0.7): mb.box((x,Ly/2,-0.2),(0.14,Ly,0.24),W_DARK,grain=1)
    deck_planks(mb,-2.0,2.0,0,Ly,along='y',m=W_AGED)
    for (x,y) in posts:
        mb.box((x,y,(1.12-2.4)/2),(0.22,0.22,1.12+2.4),W_DARK,grain=2)
        L.giboshi(mb,(x,y,1.12),0.11)
        mb.box((x,y,-2.45),(0.26,0.26,0.1),L.METAL)
    for z in (-2.1,):
        for x in (-1.89,1.89): mb.box((x,Ly/2,z),(0.14,Ly,0.18),W_DARK,grain=1)
        for y in (0.11,Ly-0.11): mb.box((0,y,z),(3.8,0.14,0.18),W_DARK,grain=0)
    for (x,y) in posts:
        sx=1 if x>0 else -1
        mb.beam((x,y,-1.3),(x-sx*0.9,y,-0.33),0.1,0.12,W_DARK)
        sy=1 if y<Ly/2 else (-1 if y>Ly/2 else 0)
        if sy: mb.beam((x,y,-1.3),(x,y+sy*0.9,-0.33),0.1,0.12,W_DARK)
    edge_railings(mb,opens,y1=Ly,inset=0.11,ps=0.13)
    if lanterns:
        for (x,y) in posts[:2] if 'S' not in opens else posts[2:4]:
            sx=1 if x>0 else -1; sy=-1 if y<Ly/2 else 1
            mb.beam((x,y,0.95),(x+sx*0.55,y+sy*0.55,0.95),0.07,0.08,W_DARK,ext=0.05)
    L.part(r,"Mesh",mb)
    if lanterns:
        for k,(x,y) in enumerate(posts[:2] if 'S' not in opens else posts[2:4]):
            sx=1 if x>0 else -1; sy=-1 if y<Ly/2 else 1
            L.inst("IC10_Lantern_Hanging_Rect",r,name+f"__Lantern_{k}",(x+sx*0.5,y+sy*0.5,0.91))
    sockets_for(r,opens,y1=Ly)

# ---------------- TIMBER FRAMEWORK ----------------
PIL=0.3; BW=0.2; BH=0.32; TOP=3.6
def pillar(mb, x, y, h=TOP, capital=True):
    mb.box((x,y,h/2),(PIL,PIL,h),W_DARK,grain=2)
    mb.box((x,y,0.05),(PIL+0.08,PIL+0.08,0.1),METAL)
    if capital:
        mb.box((x,y,h+0.1),(0.46,0.46,0.2),W_DARK,grain=0)
        mb.box((x,y,h+0.27),(0.9,0.2,0.14),W_DARK,grain=0)
        mb.box((x,y,h+0.27),(0.2,0.9,0.14),W_DARK,grain=1)
def frame_beam(mb, x0, y0, x1, y1, h=TOP):
    p0=Vector((x0,y0,h+0.5)); p1=Vector((x1,y1,h+0.5))
    mb.beam(p0,p1,BW,BH,W_DARK)
    d=(p1-p0).normalized()
    nk0=Vector((x0,y0,2.6))-d*0.32; nk1=Vector((x1,y1,2.6))
    mb.beam(nk0,nk1,0.12,0.24,W_DARK)
    wp=Vector((x0,y0,2.6))-d*0.24
    mb.box(wp+Vector((0,0,0.0)),(0.06 if abs(d.x)>0.5 else 0.03,0.03 if abs(d.x)>0.5 else 0.06,0.3),W_AGED,grain=2)
def brace(mb, x0,y0, x1,y1, h=TOP):
    p=Vector((x0,y0,0)); q=Vector((x1,y1,0)); d=(q-p).normalized()
    mb.beam(p+d*0.15+Vector((0,0,h-1.1)), p+d*1.1+Vector((0,0,h+0.32)),0.1,0.14,W_DARK)

def build_frame(name, dirs, note):
    r=L.asset_root(name,9,{"pillar":PIL,"beam":f"{BW} x {BH}","span":4.0,"top_z":TOP,"directions":"".join(dirs),"note":note})
    mb=MB(900+len(dirs)+len(name)); pillar(mb,0,0)
    vec={'E':(4,0),'W':(-4,0),'N':(0,4),'S':(0,-4)}
    for dname in dirs:
        x,y=vec[dname]; frame_beam(mb,0,0,x,y); brace(mb,0,0,x,y)
        L.socket(r,dname,(x,y,0),(0,0,math.degrees(math.atan2(y,x))))
    L.part(r,"Mesh",mb)

def build_framework():
    r=L.asset_root("IC09_Pillar",9,{"section":PIL,"height":TOP,"note":"base shoe + daito capital + cross bracket"})
    mb=MB(901); pillar(mb,0,0); L.part(r,"Mesh",mb)
    r=L.asset_root("IC09_Beam_4m",9,{"section":f"{BW} x {BH}","length":4.0,"origin":"start, runs +X"})
    mb=MB(902); mb.box((2,0,0),(4.0,BW,BH),W_DARK,grain=0)
    for x in (-0.12,4.12): mb.box((x,0,0),(0.24,BW*0.5,BH*0.6),W_AGED,grain=0)
    L.part(r,"Mesh",mb)
    r=L.asset_root("IC09_Brace_Diagonal",9,{"section":"0.1 x 0.14","length":1.34})
    mb=MB(903); mb.beam((0,0,0),(0.95,0,0.95),0.1,0.14,W_DARK)
    for p in ((0,0,0),(0.95,0,0.95)): mb.box(p,(0.06,0.16,0.06),METAL)
    L.part(r,"Mesh",mb)
    build_frame("IC09_Frame_Straight",["E"],"pillar at origin + one 4 m span; repeat along +X")
    build_frame("IC09_Frame_Corner",["E","N"],"L junction")
    build_frame("IC09_Frame_T",["E","W","N"],"T junction")
    build_frame("IC09_Frame_Cross",["E","W","N","S"],"cross junction")
    r=L.asset_root("IC09_Frame_Bay_Braced",9,{"span":4.0,"note":"two pillars, beam, X-braced bay"})
    mb=MB(905); pillar(mb,0,0); pillar(mb,4,0); frame_beam(mb,0,0,4,0)
    mb.beam((0.15,0,0.3),(3.85,0,3.3),0.1,0.14,W_DARK); mb.beam((0.15,0,3.3),(3.85,0,0.3),0.1,0.14,W_DARK)
    L.part(r,"Mesh",mb); L.socket(r,"W",(0,0,0),(0,0,180)); L.socket(r,"E",(4,0,0),(0,0,0))

# ---------------- ENTRANCE GATEWAY ----------------
def rafters(mb, ring0, ring1, t, spacing=0.3, side_axes=('y','x')):
    hx0,hy0,z0=ring0; hx1,hy1,z1=ring1
    for sgn in (-1,1):
        # front/back (normal Y)
        for k in range(int(2*(hx1-0.15)/spacing)+1):
            x=-(hx1-0.15)+k*spacing
            ya=hy1-0.15; yb=hy0-0.1
            za=z0+(hy0-ya)*(z1-z0)/(hy0-hy1)-t-0.07; zb=z0+(hy0-yb)*(z1-z0)/(hy0-hy1)-t-0.07
            mb.beam((x,sgn*ya,za),(x,sgn*yb,zb),0.07,0.09,W_DARK)
        for k in range(int(2*(hy1-0.15)/spacing)+1):
            y=-(hy1-0.15)+k*spacing
            xa=hx1-0.15; xb=hx0-0.1
            za=z0+(hx0-xa)*(z1-z0)/(hx0-hx1)-t-0.07; zb=z0+(hx0-xb)*(z1-z0)/(hx0-hx1)-t-0.07
            mb.beam((sgn*xa,y,za),(sgn*xb,y,zb),0.07,0.09,W_DARK)
    # fascia boards
    for sgn in (-1,1):
        mb.box((0,sgn*(hy0-0.04),z0-t/2-0.04),(2*hx0,0.08,0.2),W_DARK,grain=0)
        mb.box((sgn*(hx0-0.04),0,z0-t/2-0.04),(0.08,2*hy0,0.2),W_DARK,grain=1)

def build_gateway():
    r=L.asset_root("IC01_EntranceGateway",1,{"footprint":"10.4 x 5.8 m","passage_clear":"4.76 w x 4.0 h",
        "pass_axis":"Y (front = -Y)","doors":"two sliding leaves, default open"})
    mb=MB(101)
    mb.box((0,0,-0.25),(10.4,4.6,0.4),W_AGED)
    deck_planks(mb,-5.2,5.2,-2.3,2.3,w=0.26,along='y',m=W_AGED,t=0.05)
    for sy in (-1,1):
        mb.box((0,sy*2.45,-0.3),(5.4,0.3,0.3),W_POL,grain=0)
        mb.box((0,sy*2.75,-0.375),(5.8,0.3,0.15),W_POL,grain=0)
    # pillars
    for sx in (-1,1):
        for sy in (-1,1):
            x=sx*2.6; y=sy*1.1
            mb.box((x,y,2.7),(0.45,0.45,5.4),W_DARK,grain=2)
            mb.box((x,y,0.07),(0.6,0.6,0.14),METAL)
            xo=sx*4.6
            mb.box((xo,y,2.1),(0.32,0.32,4.2),W_DARK,grain=2)
            mb.box((xo,y,0.06),(0.42,0.42,0.12),METAL)
    for sy in (-1,1):
        y=sy*1.1
        mb.box((0,y,4.15),(10.0,0.2,0.32),W_DARK,grain=0)
        for sx in (-1,1):
            mb.box((sx*5.08,y,4.15),(0.12,0.08,0.2),W_AGED,grain=0)
            mb.box((sx*3.6,y,1.0),(2.0,0.16,0.22),W_DARK,grain=0)
        mb.box((0,y,5.08),(6.0,0.26,0.36),W_DARK,grain=0)
    for x in (-4.6,-2.6,2.6,4.6):
        mb.box((x,0,3.95 if abs(x)>3 else 4.5),(0.22,2.6,0.28),W_DARK,grain=1)
    # bracket sets on main pillars
    for sx in (-1,1):
        for sy in (-1,1):
            x=sx*2.6; y=sy*1.1
            mb.box((x,y,5.52),(0.62,0.62,0.24),W_DARK,grain=0)
            mb.box((x,y,5.73),(1.5,0.24,0.18),W_DARK,grain=0)
            mb.box((x,y,5.73),(0.24,1.5,0.18),W_DARK,grain=1)
            for dx,dy in ((0,0),(0.62,0),(-0.62,0),(0,0.62),(0,-0.62)):
                mb.box((x+dx,y+dy,5.9),(0.24,0.24,0.16),W_AGED)
            mb.box((x,y,6.07),(2.1,0.24,0.18),W_DARK,grain=0)
    for sy in (-1,1): mb.box((0,sy*1.1,6.3),(11.4,0.26,0.3),W_DARK,grain=0)
    for sx in (-1,1): mb.box((sx*2.6,0,6.3),(0.26,3.2,0.3),W_DARK,grain=1)
    for sx in (-1,1): mb.box((sx*4.6,0,4.35),(0.26,2.9,0.24),W_DARK,grain=1)
    # roof
    rings=[(6.4,3.5,6.45),(5.3,2.45,6.95),(4.1,1.25,7.75),(3.3,0.1,8.55)]
    mb.hip(rings,0.14,W_AGED,ridges=W_DARK,ridge_w=0.14)
    rafters(mb,rings[0],rings[1],0.14)
    mb.box((0,0,8.68),(6.9,0.3,0.26),W_DARK,grain=0)
    for sx in (-1,1):
        mb.box((sx*3.45,0,8.85),(0.3,0.36,0.5),W_DARK,grain=2)
        mb.lathe((sx*3.45,0,9.1),[(0.12,0.0),(0.16,0.06),(0.1,0.16),(0.02,0.3)],8,BRONZE)
    # lower side roofs over side bays (skirt)
    for sx in (-1,1):
        with mb.at((sx*3.6,0,4.45)):
            mb.hip([(1.4,1.9,0.0),(1.1,1.4,0.35),(0.9,1.2,0.55)],0.09,W_AGED,ridges=W_DARK,ridge_w=0.08)
    # side bays: koshi panel + lit lattice, both faces; end walls solid
    for sx in (-1,1):
        xa,xb=sorted((sx*2.85,sx*4.42))
        for sy in (-1,1):
            y=sy*1.1
            mb.box(((xa+xb)/2,y,0.5),(xb-xa,0.06,0.8),W_AGED,grain=0)
            mb.box(((xa+xb)/2,y-sy*0.02,2.45),(xb-xa,0.004,2.7),PAPER_LIT)
            for i in range(1,8): mb.box((xa+(xb-xa)*i/8,y+sy*0.01,2.45),(0.016,0.03,2.7),W_DARK,grain=2)
            for i in range(1,12): mb.box(((xa+xb)/2,y+sy*0.01,1.1+2.7*i/12),(xb-xa,0.03,0.016),W_DARK,grain=0)
            mb.box(((xa+xb)/2,y,3.88),(xb-xa,0.14,0.12),W_DARK,grain=0)
        mb.box((sx*4.62,0,2.0),(0.06,1.9,3.8),W_AGED,grain=2)
    # door track + transom
    mb.box((0,0,4.06),(5.2,0.16,0.12),W_DARK,grain=0)
    mb.box((0,0,-0.02),(5.2,0.18,0.04),W_POL,grain=0)
    mb.box((0,-0.015,4.55),(4.76,0.004,0.75),PAPER_LIT)
    for i in range(1,16): mb.box((-2.38+4.76*i/16,0.0,4.55),(0.018,0.03,0.75),W_DARK,grain=2)
    mb.box((0,0,4.55),(4.76,0.03,0.02),W_DARK,grain=0)
    L.part(r,"Structure",mb)
    # doors (separate, open by default: slid behind side bays)
    import build_p1a
    for side,x_open,x_closed,yy in (("L",-4.83,-2.38,-0.03),("R",2.38,0.0,0.03)):
        mbd=MB(150+len(side)); build_p1a.shoji_leaf(mbd,2.38,4.0,"Fine",kick=0.6)
        ob=L.part(r,f"Door_{side}",mbd,loc=(x_open,yy,0.0),props={"ic_movable":"slide_x","slide_open_x":x_open,"slide_closed_x":x_closed,"slide_distance":2.45})
    for sx,s in ((-1,"L"),(1,"R")):
        L.inst("IC10_Lantern_Hanging_Hex",r,f"IC01_EntranceGateway__Lantern_{s}",(sx*3.6,-1.95,6.25))
    L.socket(r,"Front",(0,-2.9,-0.45),(0,0,-90)); L.socket(r,"Back",(0,2.9,-0.45),(0,0,90))

def run():
    build_bridge_straight("IC07_Bridge_Straight",4.0)
    build_bridge_straight("IC07_Bridge_Straight_Lantern",4.0,lantern=True)
    build_bridge_straight("IC07_Bridge_Straight_8m",8.0)
    build_bridge_junction("IC07_Bridge_Corner",['S','E'])
    build_bridge_junction("IC07_Bridge_Tee",['S','E','W'])
    build_bridge_junction("IC07_Bridge_Cross",['S','E','N','W'])
    build_balcony("IC08_Balcony_Square",4.0,['S'])
    build_balcony("IC08_Balcony_Square_Through",4.0,['S','N'])
    build_balcony("IC08_Balcony_Square_Corner",4.0,['S','E'])
    build_balcony("IC08_Balcony_Rect",8.0,['S','E','W'])
    build_framework()
    build_gateway()
