# build_p2b.py - central abyss cluster (12) and infinite crossroads (13)
import bpy, math, random
from mathutils import Vector
import ic_lib as L
from ic_lib import MB, W_DARK, W_AGED, W_POL, EMIT, BRONZE, METAL
from build_p1c import deck_planks

S=L.STORY
def share(src, parent, name, loc, rot=(0,0,0)):
    ob=bpy.data.objects.new(name, src.data); parent.users_collection[0].objects.link(ob)
    ob.parent=parent; ob.location=loc; ob.rotation_euler=[math.radians(a) for a in rot]; return ob
def rz_of(d): return math.degrees(math.atan2(d[1],d[0]))-90.0

def shaft_mesh(kmin=-7, kmax=8):
    mb=MB(1201); z0=kmin*S-0.6; z1=kmax*S+0.4
    for x in (-1.85,1.85):
        for y in (-1.85,1.85): mb.box((x,y,(z0+z1)/2),(0.34,0.34,z1-z0),W_DARK,grain=2)
    for k in range(kmin,kmax+1):
        z=k*S
        for s in (-1,1):
            mb.box((0,s*1.85,z-0.22),(4.04,0.22,0.3),W_DARK,grain=0); mb.box((s*1.85,0,z-0.22),(0.22,4.04,0.3),W_DARK,grain=1)
        if k<kmax: deck_planks(mb,-1.68,1.68,-1.68,1.68,w=0.24,along='x' if k%2 else 'y',m=W_AGED,z=z,t=0.05)
        if k<kmax:
            f=k%4
            with mb.at((0,0,0),rz=90*f):
                mb.beam((-1.7,-1.85,z+0.1),(1.7,-1.85,z+S-0.4),0.1,0.14,W_DARK)
                mb.beam((-1.7,-1.85,z+S-0.4),(1.7,-1.85,z+0.1),0.1,0.14,W_DARK)
            for s in (-1,1):
                mb.box((0,s*1.85,z+2.4),(3.7,0.12,0.2),W_DARK,grain=0); mb.box((s*1.85,0,z+2.4),(0.12,3.7,0.2),W_DARK,grain=1)
    mb.hip([(3.4,3.4,z1),(2.5,2.5,z1+0.45),(0.2,0.2,z1+2.4)],0.14,W_AGED,ridges=W_DARK,ridge_w=0.12)
    with mb.at((0,0,z0),rx=180):
        mb.hip([(3.4,3.4,0.0),(2.5,2.5,0.45),(0.2,0.2,2.4)],0.14,W_AGED,ridges=W_DARK,ridge_w=0.12)
    mb.lathe((0,0,z1+2.3),[(0.12,0.0),(0.16,0.1),(0.06,0.5),(0.02,0.9)],8,BRONZE)
    return mb

def build_abyss():
    rnd=random.Random(1212)
    r=L.asset_root("IC12_Central_Abyss_Cluster",12,{"extent":"~180 m wide, ~110 m tall","clear_core":"camera shaft radius ~12 m around Z axis kept empty",
        "layers":"foreground towers r=16, midground blocks r=25-40, background r=55-90","mesh_data":"instanced (linked) from library assets"})
    tower0=L.part(r,"Shaft_Tower_00",shaft_mesh(),loc=(16,16,0))
    TP=[(16,16),(16,0),(16,-16),(0,-16),(-16,-16),(-16,0),(-16,16),(0,16)]
    towers=[tower0]+[share(tower0,r,f"IC12_Central_Abyss_Cluster__Shaft_Tower_{i:02d}",(x,y,0),(0,0,90*(i%4))) for i,(x,y) in enumerate(TP) if i>0]
    used={i:set() for i in range(8)}
    n=[0]
    def put(src, loc, rot=(0,0,0), tag=None):
        n[0]+=1; nm=f"IC12_{(tag or src.split('_',1)[1])}_{n[0]:03d}"
        return L.inst(src,r,nm,loc,rot)
    # perimeter bridges / stairs between towers
    for e in range(8):
        a=Vector(TP[e]+(0,)); b=Vector(TP[(e+1)%8]+(0,)); d=(b-a).normalized(); rz=rz_of(d)
        ks=rnd.sample([k for k in range(-5,6)],2)
        for j,k in enumerate(ks):
            z=k*S
            if j==1 and k<6:
                put("IC05_Staircase_Full",a+d*2+Vector((0,0,z)),(0,0,rz),"Stair")
                put("IC07_Bridge_Straight_Lantern",a+d*10+Vector((0,0,z+S)),(0,0,rz),"Bridge")
                used[e].add(k); used[(e+1)%8].add(k+1)
            else:
                for i in range(3):
                    put("IC07_Bridge_Straight_Lantern" if i==1 else "IC07_Bridge_Straight",a+d*(2+4*i)+Vector((0,0,z)),(0,0,rz),"Bridge")
                used[e].add(k); used[(e+1)%8].add(k)
    # outward room blocks / balconies / inverted blocks
    blocks=["IC11_RoomBlock_A","IC11_RoomBlock_B_TwoStory","IC11_RoomBlock_C_Gabled"]
    for i,(x,y) in enumerate(TP):
        T=Vector((x,y,0))
        outs=[Vector((math.copysign(1,x),0,0))] if x else []
        outs+=[Vector((0,math.copysign(1,y),0))] if y else []
        for j,nv in enumerate(outs):
            k=rnd.choice([k for k in range(-5,5) if k not in used[i]]); used[i]|={k,k+1,k-1}
            z=k*S; rz=rz_of(nv)
            if (i+j)%4==3:
                put("IC06_Inverted_Bridge_Straight",T+nv*2+Vector((0,0,z)),(0,0,rz),"InvBridge")
                put("IC06_Inverted_RoomBlock_A",T+nv*11.2+Vector((0,0,z)),(0,0,rz),"InvBlock")
                continue
            put("IC07_Bridge_Straight",T+nv*2+Vector((0,0,z)),(0,0,rz),"Bridge")
            src=blocks[(i+j)%3]
            if src.endswith("Gabled"):
                put(src,T+nv*9.4+Vector((0,0,z)),(0,0,math.degrees(math.atan2(-nv.y,-nv.x))),"Block")
            else:
                put(src,T+nv*11.2+Vector((0,0,z)),(0,0,rz),"Block")
        for m in range(2):
            nv=rnd.choice(outs); free=[k for k in range(-6,7) if k not in used[i]]
            if not free: continue
            k=rnd.choice(free); used[i].add(k)
            put("IC08_Balcony_Square",T+nv*2+Vector((0,0,k*S)),(0,0,rz_of(nv)),"Balcony")
        for k in range(-6,8,2): put("IC10_Lantern_Hanging_Hex",T+Vector((0,0,k*S-0.25)),(0,0,0),"Lantern")
    # wall staircases on tower faces (impossible orientation)
    put("IC06_Wall_Staircase_Full",Vector((18.1,-6,-10)),(0,0,90),"WallStair")
    put("IC06_Wall_Staircase_Full",Vector((-18.1,6,8)),(0,0,-90),"WallStair")
    # midground floating blocks (some sideways / inverted)
    for k in range(10):
        a=math.radians(18+36*k+rnd.uniform(-8,8)); R=rnd.uniform(30,42)
        loc=Vector((R*math.cos(a),R*math.sin(a),rnd.uniform(-34,34)))
        src=rnd.choice(blocks+["IC06_Inverted_RoomBlock_A","IC11_RoomBlock_A"])
        rot=(rnd.choice([0,0,0,90,-90]),0,rnd.choice([0,90,180,270]))
        put(src,loc,rot,"MidBlock")
    for k in range(6):
        a=math.radians(rnd.uniform(0,360)); R=rnd.uniform(28,36)
        put(rnd.choice(["IC08_Balcony_Rect","IC06_Inverted_Balcony_Square","IC05_Staircase_Full","IC06_Inverted_Staircase_Full"]),
            Vector((R*math.cos(a),R*math.sin(a),rnd.uniform(-30,30))),(0,0,rnd.choice([0,90,180,270])),"MidPiece")
    # background ring
    bgs=["IC19_BG_Tower_S","IC19_BG_Tower_M","IC19_BG_Tower_L","IC19_BG_Block_Wide","IC19_BG_Balcony_Row","IC19_BG_Corridor_Distant","IC19_BG_Suspended_Cluster"]
    for k in range(30):
        a=math.radians(12*k+rnd.uniform(-5,5)); R=rnd.uniform(55,90)
        loc=Vector((R*math.cos(a),R*math.sin(a),rnd.uniform(-48,48)))
        rx=180 if rnd.random()<0.25 else 0
        put(bgs[k%len(bgs)],loc,(rx,0,math.degrees(a)+90),"BG")
    # sparse lanterns and void props (outside the clear core r<12)
    for k in range(14):
        a=math.radians(rnd.uniform(0,360)); R=rnd.uniform(12,24)
        put("IC20_Hanging_Chain_Lantern",Vector((R*math.cos(a),R*math.sin(a),rnd.uniform(-30,32))),(0,0,0),"ChainLantern")
    props=["IC20_Floating_Planks","IC20_Broken_Beam","IC20_Debris_Small","IC20_Railing_Fragment","IC20_Suspended_Frame_Piece","IC20_Stair_Fragment"]
    for k in range(14):
        a=math.radians(rnd.uniform(0,360)); R=rnd.uniform(14,40)
        put(props[k%len(props)],Vector((R*math.cos(a),R*math.sin(a),rnd.uniform(-35,35))),(rnd.uniform(-30,30),rnd.uniform(-30,30),rnd.uniform(0,360)),"Prop")
    L.socket(r,"CameraCore",(0,0,0),(0,-90,0))

def hub_mesh():
    mb=MB(1301)
    mb.box((0,-4,-0.18),(12,4,0.24),W_AGED); mb.box((0,4,-0.18),(12,4,0.24),W_AGED)
    mb.box((-4,0,-0.18),(4,4,0.24),W_AGED); mb.box((4,0,-0.18),(4,4,0.24),W_AGED)
    deck_planks(mb,-6,6,-6,-2,w=0.25,along='y',m=W_POL,t=0.06); deck_planks(mb,-6,6,2,6,w=0.25,along='y',m=W_POL,t=0.06)
    deck_planks(mb,-6,-2,-2,2,w=0.25,along='y',m=W_POL,t=0.06); deck_planks(mb,2,6,-2,2,w=0.25,along='y',m=W_POL,t=0.06)
    for s in (-1,1):
        mb.box((0,s*2.05,-0.3),(4.2,0.12,0.4),W_DARK,grain=0); mb.box((s*2.05,0,-0.3),(0.12,4.2,0.4),W_DARK,grain=1)
    sq=[(-2.06,-2.06),(2.06,-2.06),(2.06,2.06),(-2.06,2.06)]
    for i in range(4):
        a=Vector(sq[i]+(0,)); b=Vector(sq[(i+1)%4]+(0,)); mb.railing(a,b,post_ts=(0.0,0.5),ps=0.12,finial=True)
    for x in (-5.8,5.8):
        for y in (-5.8,5.8):
            mb.box((x,y,2.0),(0.4,0.4,11.2),W_DARK,grain=2)
            mb.box((x,y,7.75),(0.6,0.6,0.25),W_DARK)
            L.giboshi(mb,(x,y,7.87),0.16)
    for z in (3.4,7.4):
        for s in (-1,1):
            mb.box((0,s*5.8,z),(12.2,0.26,0.34),W_DARK,grain=0); mb.box((s*5.8,0,z),(0.26,12.2,0.34),W_DARK,grain=1)
    for x in (-5.8,5.8):
        for y in (-5.8,5.8):
            sx=-1 if x>0 else 1; sy=-1 if y>0 else 1
            mb.beam((x,y,2.4),(x+sx*1.2,y,3.25),0.12,0.16,W_DARK); mb.beam((x,y,2.4),(x,y+sy*1.2,3.25),0.12,0.16,W_DARK)
    for s in (-1,1):
        mb.box((0,s*5.8,-0.5),(12.2,0.26,0.4),W_DARK,grain=0); mb.box((s*5.8,0,-0.5),(0.26,12.2,0.4),W_DARK,grain=1)
    segs={'N':[(-5.7,-1.8),(1.8,2.6)],'S':[(1.8,5.7),(-2.6,-1.8)],'E':[(-5.7,-1.8),(1.8,5.7)],'W':[(-5.7,-1.8),(1.8,5.7)]}
    for side,rng in segs.items():
        for u0,u1 in rng:
            if side=='N': a,b=(u0,5.88,0),(u1,5.88,0)
            elif side=='S': a,b=(u0,-5.88,0),(u1,-5.88,0)
            elif side=='E': a,b=(5.88,u0,0),(5.88,u1,0)
            else: a,b=(-5.88,u0,0),(-5.88,u1,0)
            mb.railing(a,b,post_ts=(0.0,1.0),ps=0.12)
    return mb

def build_crossroads():
    r=L.asset_root("IC13_Infinite_Crossroads",13,{"extent":"~40 x 40 m, z -7..+22","hub":"12 x 12 open pavilion with 4 x 4 vertical shaft opening",
        "connections":"corridors N/S/E/W, ascending stair NE, descending stair SW, crossing bridges at +7.2 and +10.8"})
    L.part(r,"Hub",hub_mesh())
    n=[0]
    def put(src, loc, rot=(0,0,0), tag="Piece"):
        n[0]+=1; return L.inst(src,r,f"IC13_{tag}_{n[0]:03d}",loc,rot)
    vars_=["IC04_Corridor_Straight_A","IC04_Corridor_Straight_C","IC04_Corridor_Straight_B"]
    for k in range(3):
        put(vars_[k%3],(0,6+4*k,0),(0,0,0),"CorridorN")
        put(vars_[(k+1)%3],(0,-6-4*k,0),(0,0,180),"CorridorS")
        put(vars_[(k+2)%3],(6+4*k,0,0),(0,0,-90),"CorridorE")
        put(vars_[k%3],(-6-4*k,0,0),(0,0,90),"CorridorW")
    put("IC05_Staircase_Full",(4,6,0),(0,0,0),"StairUp")
    put("IC08_Balcony_Square",(4,14,S),(0,0,0),"BalconyUp")
    put("IC05_Staircase_Full",(-4,-14,-S),(0,0,0),"StairDown")
    put("IC08_Balcony_Square",(-4,-14,-S),(0,0,180),"BalconyDown")
    for sx in (-1,1):
        for k in range(8):
            put("IC07_Bridge_Straight_Lantern" if k%3==1 else "IC07_Bridge_Straight",(sx*8,-16+4*k,2*S),(0,0,0),"BridgeHigh")
        put("IC08_Balcony_Square",(sx*8,16,2*S),(0,0,0),"BalconyHigh"); put("IC08_Balcony_Square",(sx*8,-16,2*S),(0,0,180),"BalconyHigh")
    for sy in (-1,1):
        for k in range(8):
            put("IC07_Bridge_Straight_Lantern" if k%3==1 else "IC07_Bridge_Straight",(-16+4*k,sy*8,3*S),(0,0,-90),"BridgeTop")
        put("IC08_Balcony_Square",(16,sy*8,3*S),(0,0,-90),"BalconyTop"); put("IC08_Balcony_Square",(-16,sy*8,3*S),(0,0,90),"BalconyTop")
    put("IC08_Balcony_Rect",(12,12,S),(0,0,0),"Suspended"); put("IC08_Balcony_Rect",(-12,12,-S),(0,0,90),"Suspended")
    put("IC08_Balcony_Square_Corner",(12,-12,-2*S),(0,0,180),"Suspended")
    put("IC06_Inverted_Staircase_Full",(-10,4,5*S),(0,0,0),"InvStair")
    for k in range(4): put("IC06_Inverted_Corridor_A",(-8+4*k,-12,6*S),(0,0,-90),"InvCorridor")
    put("IC06_Wall_Staircase_Full",(14,-10,0.0),(0,0,90),"WallStair")
    put("IC06_Inverted_TatamiRoom_A",(14,14,6*S),(0,0,0),"InvRoom")
    for x,y in ((0,5.8),(0,-5.8),(5.8,0),(-5.8,0)): put("IC10_Lantern_Hanging_Rect",(x,y,7.2),(0,0,0),"Lantern")
    for x,y in ((3.5,3.5),(-3.5,3.5),(3.5,-3.5),(-3.5,-3.5)): put("IC10_Lantern_Hanging_Hex",(x*1.6,y*1.6,3.2),(0,0,0),"Lantern")
    for nm,loc,rz in (("N",(0,18,0),90),("S",(0,-18,0),-90),("E",(18,0,0),0),("W",(-18,0,0),180)): L.socket(r,nm,loc,(0,0,rz))
    L.socket(r,"ShaftUp",(0,0,0),(0,-90,0)); L.socket(r,"ShaftDown",(0,0,0),(0,90,0))

def run():
    build_abyss(); build_crossroads()
