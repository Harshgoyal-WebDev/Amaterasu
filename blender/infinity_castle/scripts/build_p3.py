# build_p3.py - wall panels (14), windows (15), ceilings (16), floors (17), decor (18), background (19), void props (20)
import bpy, math, random
from mathutils import Vector
import ic_lib as L
from ic_lib import MB, W_DARK, W_AGED, W_POL, PAPER, PAPER_LIT, EMIT, BRONZE, METAL, TATAMI, FABRIC, BG
from build_p1c import deck_planks

PH=3.0; T=0.1
def frame(mb, w, h=PH, st=0.08):
    mb.box((st/2,0,h/2),(st,T,h),W_DARK,grain=2); mb.box((w-st/2,0,h/2),(st,T,h),W_DARK,grain=2)
    mb.box((w/2,0,h-0.05),(w-2*st,T,0.1),W_DARK,grain=0); mb.box((w/2,0,0.06),(w-2*st,T,0.12),W_DARK,grain=0)
def boards(mb, x0, x1, z0, z1, y=0.0, bw=0.2, t=0.04, m=W_AGED):
    if x1-x0<0.02 or z1-z0<0.02: return
    n=max(1,int(round((x1-x0)/bw))); s=(x1-x0)/n
    for i in range(n): mb.box((x0+s*(i+0.5),y,(z0+z1)/2),(s-0.004,t,z1-z0),m,grain=2)
def lattice(mb, x0, x1, z0, z1, nv, nh, lit=True, y=0.0, paper=True):
    if paper: mb.box(((x0+x1)/2,y-0.012,(z0+z1)/2),(x1-x0,0.003,z1-z0),PAPER_LIT if lit else PAPER)
    for i in range(1,nv+1): mb.box((x0+(x1-x0)*i/(nv+1),y,(z0+z1)/2),(0.014,0.02,z1-z0),W_DARK,grain=2)
    for i in range(1,nh+1): mb.box(((x0+x1)/2,y,z0+(z1-z0)*i/(nh+1)),(x1-x0,0.02,0.014),W_DARK,grain=0)
def diamonds(mb, a, b, za, zb, s=0.22, y=0.0, w=0.018):
    k0=int(math.floor((a-zb)/s))-1; k1=int(math.ceil((b-za)/s))+1
    for k in range(k0,k1+1):
        c=k*s
        x0=max(a,za+c); x1=min(b,zb+c)
        if x1-x0>0.02: mb.beam((x0,y,x0-c),(x1,y,x1-c),0.02,w,W_DARK,up=(0,1,0))
    k0=int(math.floor((a+za)/s))-1; k1=int(math.ceil((b+zb)/s))+1
    for k in range(k0,k1+1):
        c=k*s
        x0=max(a,c-zb); x1=min(b,c-za)
        if x1-x0>0.02: mb.beam((x0,y,c-x0),(x1,y,c-x1),0.02,w,W_DARK,up=(0,1,0))

def panel_asset(name, cat, w, build, props=None):
    p={"width":w,"height":PH,"thickness":T,"origin":"bottom-left on wall centreline, runs +X"}; p.update(props or {})
    r=L.asset_root(name,cat,p); mb=MB(L.seed(name)); build(mb)
    L.part(r,"Mesh",mb); L.socket(r,"Left",(0,0,0),(0,0,180)); L.socket(r,"Right",(w,0,0),(0,0,0))
    return r

def build_walls():
    for w in (1.2,2.4):
        tag=f"{int(w*1000)}"
        def solid(mb,w=w):
            frame(mb,w); boards(mb,0.08,w-0.08,0.12,PH-0.1,0.0)
            for z in (0.9,1.9,2.6): mb.box((w/2,0.035,z),(w-0.16,0.03,0.08),W_DARK,grain=0)
        panel_asset(f"IC14_WallPanel_SolidWood_{tag}",14,w,solid)
        def shoji(mb,w=w):
            frame(mb,w); mb.box((w/2,0,0.36),(w-0.16,0.05,0.48),W_AGED,grain=0)
            mb.box((w/2,0,0.62),(w-0.16,T,0.06),W_DARK,grain=0)
            lattice(mb,0.08,w-0.08,0.65,2.42,int(w/0.3),9)
            mb.box((w/2,0,2.48),(w-0.16,T,0.12),W_DARK,grain=0)
            lattice(mb,0.08,w-0.08,2.54,PH-0.1,int(w/0.15),1)
        panel_asset(f"IC14_WallPanel_Shoji_Lit_{tag}",14,w,shoji,{"lit":1})
    def paper(mb,w=1.2):
        frame(mb,w); lattice(mb,0.08,w-0.08,0.12,PH-0.1,2,3,lit=False)
    panel_asset("IC14_WallPanel_Paper_1200",14,1.2,paper,{"lit":0,"note":"translucent unlit paper"})
    def deco(mb,w=2.4):
        frame(mb,w); boards(mb,0.08,w-0.08,0.12,1.0,0.0)
        mb.box((w/2,0,1.04),(w-0.16,T,0.08),W_DARK,grain=0)
        mb.box((w/2,-0.02,1.8),(w-0.16,0.004,1.44),PAPER_LIT)
        diamonds(mb,0.08,w-0.08,1.08,2.52)
        mb.box((w/2,0,2.56),(w-0.16,T,0.08),W_DARK,grain=0)
        boards(mb,0.08,w-0.08,2.6,PH-0.1,0.0)
        mb.box((w/2,0.06,2.56),(w,0.04,0.12),W_DARK,grain=0)
        for x in (0.3,w/2,w-0.3): mb.lathe((x,0.08,2.56),[(0.045,0.0),(0.05,0.01),(0.03,0.025),(0.008,0.035)],10,BRONZE,R=L.rot(-90,0,0))
    panel_asset("IC14_WallPanel_Decorative_2400",14,2.4,deco,{"lit":1,"note":"hishi diamond lattice + bronze kugikakushi"})
    r=L.asset_root("IC14_WallPanel_Ranma_2400",14,{"width":2.4,"height":0.5,"note":"transom strip, sits on top of a 2.5 m opening"})
    mb=MB(1405); mb.box((1.2,0,0.03),(2.4,T,0.06),W_DARK,grain=0); mb.box((1.2,0,0.47),(2.4,T,0.06),W_DARK,grain=0)
    mb.box((1.2,-0.02,0.25),(2.4,0.004,0.38),PAPER_LIT); diamonds(mb,0.0,2.4,0.06,0.44,s=0.14)
    L.part(r,"Mesh",mb)

def wall_with_opening(mb, w, x0, x1, z0, z1):
    frame(mb,w)
    boards(mb,0.08,w-0.08,0.12,z0,0.0); boards(mb,0.08,w-0.08,z1,PH-0.1,0.0)
    boards(mb,0.08,x0,z0,z1,0.0); boards(mb,x1,w-0.08,z0,z1,0.0)
    mb.box(((x0+x1)/2,0,z0-0.04),(x1-x0+0.16,T+0.04,0.08),W_DARK,grain=0)
    mb.box(((x0+x1)/2,0,z1+0.04),(x1-x0+0.16,T+0.04,0.08),W_DARK,grain=0)
    for x in (x0-0.04,x1+0.04): mb.box((x,0,(z0+z1)/2),(0.08,T+0.04,z1-z0),W_DARK,grain=2)

def build_windows():
    def rect(mb):
        wall_with_opening(mb,2.4,0.4,2.0,0.9,1.9)
        for i,x in enumerate((0.4,1.2)):
            yy=-0.02 if i==0 else 0.02
            mb.box((x+0.4,yy,1.4),(0.8,0.025,1.0),W_DARK)
            mb.box((x+0.4,yy-0.006,1.4),(0.72,0.003,0.92),PAPER_LIT)
            for k in range(1,4): mb.box((x+0.04+0.72*k/4,yy+0.004,1.4),(0.012,0.018,0.92),W_DARK,grain=2)
            for k in range(1,5): mb.box((x+0.4,yy+0.004,0.94+0.92*k/5),(0.72,0.018,0.012),W_DARK,grain=0)
        mb.box((1.2,0.12,0.84),(1.8,0.14,0.05),W_POL,grain=0)
    panel_asset("IC15_Window_Shoji_Rectangular",15,2.4,rect,{"opening":"1.6 x 1.0, sill 0.9"})
    def narrow(mb):
        frame(mb,2.4)
        xs=[(0.35,0.8),(1.6,2.05)]
        boards(mb,0.08,2.32,0.12,0.6,0.0); boards(mb,0.08,2.32,2.4,2.9,0.0)
        boards(mb,0.08,0.35,0.6,2.4,0.0); boards(mb,0.8,1.6,0.6,2.4,0.0); boards(mb,2.05,2.32,0.6,2.4,0.0)
        for a,b in xs:
            mb.box(((a+b)/2,-0.03,1.5),(b-a,0.003,1.8),PAPER_LIT)
            for k in range(1,6): mb.box((a+(b-a)*k/6,0.0,1.5),(0.025,0.05,1.8),W_DARK,grain=2)
            for z in (0.58,2.42): mb.box(((a+b)/2,0,z),(b-a+0.1,0.13,0.06),W_DARK,grain=0)
    panel_asset("IC15_Window_Narrow_Vertical",15,2.4,narrow,{"openings":"two 0.45 x 1.8 renji slats"})
    def passage(mb):
        for x in (0.1,2.3): mb.box((x,0,PH/2),(0.2,0.24,PH),W_DARK,grain=2)
        mb.box((1.2,0,2.46),(2.4,0.24,0.12),W_DARK,grain=0)
        mb.box((1.2,0.1,2.56),(2.7,0.06,0.12),W_DARK,grain=0)
        mb.box((1.2,0,PH-0.06),(2.4,0.24,0.12),W_DARK,grain=0)
        lattice(mb,0.2,2.2,2.52,PH-0.12,12,1)
        mb.box((1.2,0,-0.02),(2.4,0.24,0.04),W_POL,grain=0)
    panel_asset("IC15_Opening_Passage",15,2.4,passage,{"clear":"2.0 x 2.4","note":"open timber passageway"})
    def balcony(mb):
        for x in (0.1,2.3): mb.box((x,0,PH/2),(0.2,0.2,PH),W_DARK,grain=2)
        mb.box((1.2,0,2.46),(2.4,0.2,0.12),W_DARK,grain=0)
        lattice(mb,0.2,2.2,2.52,PH-0.1,12,1)
        mb.box((1.2,0,PH-0.05),(2.4,0.2,0.1),W_DARK,grain=0)
        mb.railing((0.2,-0.25,0),(2.2,-0.25,0),post_ts=(0.0,1.0),h=0.75,ps=0.09)
        mb.box((1.2,-0.25,-0.03),(2.4,0.6,0.06),W_AGED,grain=0)
    panel_asset("IC15_Opening_Balcony",15,2.4,balcony,{"clear":"2.0 x 2.4","note":"opening with low exterior railing on -Y"})
    def renji(mb):
        wall_with_opening(mb,1.2,0.15,1.05,1.0,1.9)
        for k in range(1,8): mb.box((0.15+0.9*k/8,-0.04,1.45),(0.03,0.04,0.9),W_DARK,grain=2)
        mb.box((0.6,0.02,1.45),(0.9,0.003,0.9),PAPER_LIT)
        mb.slab([(0.0,-0.02,2.12),(1.2,-0.02,2.12),(1.2,-0.42,1.98),(0.0,-0.42,1.98)][::-1],0.03,W_AGED)
        for x in (0.1,1.1): mb.beam((x,-0.04,1.95),(x,-0.38,2.0),0.04,0.05,W_DARK)
    panel_asset("IC15_Window_Renji_Frame",15,1.2,renji,{"opening":"0.9 x 0.9 slatted window with hood"})

def build_ceilings():
    def ceil(name, fn, note):
        r=L.asset_root(name,16,{"size":"4 x 4 centred","origin":"ceiling plane (visible side = -Z)","note":note})
        mb=MB(L.seed(name)); mb.box((0,0,0.03),(4.0,4.0,0.04),W_AGED); fn(mb); L.part(r,"Mesh",mb)
        L.socket(r,"Hook",(0,0,-0.02),(0,90,0)); return r
    def coffer(mb):
        for k in range(8):
            v=-1.75+0.5*k
            mb.box((v,0,-0.06),(0.07,4.0,0.12),W_DARK,grain=1); mb.box((0,v,-0.06),(4.0,0.07,0.12),W_DARK,grain=0)
        for k in range(4):
            v=-1.5+1.0*k
            mb.box((v,0,-0.13),(0.14,4.0,0.12),W_DARK,grain=1)
    ceil("IC16_Ceiling_Coffered",coffer,"goutenjou coffer grid 0.5 m")
    def batten(mb):
        for k in range(9): mb.box((0,-1.8+0.45*k,-0.02),(4.0,0.035,0.035),W_DARK,grain=0)
        mb.box((0,0,-0.14),(4.0,0.2,0.22),W_DARK,grain=0)
    ceil("IC16_Ceiling_Batten",batten,"saobuchi battens 0.45 m")
    def beamed(mb):
        for x in (-1.0,1.0): mb.box((x,0,-0.17),(0.22,4.0,0.3),W_DARK,grain=1)
        for k in range(9): mb.box((0,-1.8+0.45*k,-0.02),(4.0,0.035,0.035),W_DARK,grain=0)
        mb.box((0,0,-0.08),(2.0,0.16,0.16),W_DARK,grain=0)
        mb.lathe((0,0,-0.22),[(0.03,0.0),(0.07,0.04),(0.07,0.06)],10,BRONZE)
    r=ceil("IC16_Ceiling_Beamed_Lantern",beamed,"exposed beams + lantern mount")
    L.inst("IC10_Lantern_Hanging_Rect",r,r.name+"__Lantern",(0,0,-0.22))

def build_floors():
    def flo(name, fn, note):
        r=L.asset_root(name,17,{"size":"4 x 4 centred","top_z":0.0,"note":note})
        mb=MB(L.seed(name)); fn(mb); L.part(r,"Mesh",mb); return r
    def polished(mb):
        mb.box((0,0,-0.1),(4.0,4.0,0.12),W_AGED)
        for i in range(20):
            x=-1.9+0.2*i; off=(i%2)*1.0
            cuts=[-2.0]+[c for c in (-1.0+off,1.0+off) if -2.0<c<2.0]+[2.0]
            for a,b in zip(cuts[:-1],cuts[1:]): mb.box((x,(a+b)/2,-0.02),(0.196,b-a-0.004,0.04),W_POL,grain=1)
    flo("IC17_Floor_Wood_Polished",polished,"staggered polished boards")
    def tatami(mb):
        mb.box((0,0,-0.1),(4.0,4.0,0.09),W_AGED)
        mats=[(-1.0,1.5,1),(-1.0,0.5,1),(0.5,1.0,0),(1.5,1.0,0),(-1.5,-1.0,0),(-0.5,-1.0,0),(1.0,-0.5,1),(1.0,-1.5,1)]
        for cx,cy,h in mats:
            mb.box((cx,cy,-0.0275),(1.996,0.996,0.055) if h else (0.996,1.996,0.055),TATAMI,fit=True)
    flo("IC17_Floor_Tatami",tatami,"8 mats 1 x 2 m")
    def parquet(mb):
        mb.box((0,0,-0.1),(4.0,4.0,0.12),W_AGED)
        for i in range(4):
            for j in range(4):
                cx=-1.5+i; cy=-1.5+j; m=W_POL if (i+j)%2 else W_AGED
                for k in range(5):
                    o=-0.4+0.2*k
                    if (i+j)%2: mb.box((cx+o,cy,-0.02),(0.196,0.996,0.04),m,grain=1)
                    else: mb.box((cx,cy+o,-0.02),(0.996,0.196,0.04),m,grain=0)
    flo("IC17_Floor_Tile_Parquet",parquet,"1 m parquet squares")
    def raised(mb):
        mb.box((0,0,-0.06),(4.0,4.0,0.12),W_AGED)
        mb.box((0,0.25,0.2),(3.8,3.3,0.4),W_DARK)
        deck_planks(mb,-1.9,1.9,-1.4,1.9,w=0.2,along='y',m=W_POL,z=0.45,t=0.05)
        for x in (-1.9,1.9):
            for y in (-1.4,1.9): mb.box((x,y,0.2),(0.14,0.14,0.5),W_DARK,grain=2)
        mb.box((0,-1.65,0.11),(3.0,0.5,0.22),W_POL,grain=0)
    flo("IC17_Floor_Raised_Platform",raised,"raised 0.45 m platform with step, fits 4 x 4 grid")

def build_decor():
    def deco(name, fn, note):
        r=L.asset_root(name,18,{"note":note}); mb=MB(L.seed(name)); fn(mb); L.part(r,"Mesh",mb); return r
    deco("IC18_Finial_Giboshi",lambda mb: L.giboshi(mb,(0,0,0),0.1),"bronze railing post finial, origin = post top")
    def lotus(mb):
        mb.lathe((0,0,0),[(0.07,0.0),(0.09,0.03),(0.06,0.06),(0.1,0.1),(0.04,0.16),(0.012,0.22)],12,BRONZE)
    deco("IC18_Finial_Lotus",lotus,"lotus finial")
    def capf(mb):
        mb.box((0,0,0.02),(0.16,0.16,0.04),W_DARK); mb.hip([(0.09,0.09,0.04),(0.01,0.01,0.12)],0.02,W_DARK)
    deco("IC18_Finial_Pyramid_Cap",capf,"wooden pyramid post cap")
    def bracket(mb):
        pts=[(0,0),(1.0,0),(1.0,-0.1),(0.92,-0.16),(0.8,-0.14),(0.72,-0.22),(0.58,-0.2),(0.5,-0.28),(0.34,-0.26),(0.24,-0.32),(0,-0.32)]
        mb.slab([(x,0.09,z) for x,z in pts][::-1],0.18,W_DARK,grain=(1,0,0))
        mb.box((0.02,0,-0.16),(0.04,0.2,0.34),W_AGED)
    deco("IC18_Bracket_Carved_Kibana",bracket,"carved beam-end bracket, origin = wall face, projects +X")
    def banner(mb):
        mb.tube((-0.4,0,2.5),(0.4,0,2.5),0.02,8,W_DARK)
        for x in (-0.42,0.42): mb.lathe((x,0,2.5),[(0.03,-0.03),(0.03,0.03)],8,BRONZE,R=L.rot(0,90,0))
        mb.box((0,0,1.4),(0.62,0.012,2.1),FABRIC,grain=2)
        mb.lathe((0,-0.008,1.85),[(0.16,0.0),(0.16,0.006)],20,BRONZE,R=L.rot(90,0,0))
        mb.lathe((0,-0.016,1.85),[(0.11,0.0),(0.11,0.004)],20,FABRIC,R=L.rot(90,0,0))
        mb.tube((-0.32,0,0.33),(0.32,0,0.33),0.015,8,W_DARK)
        for x in (-0.25,0.25): mb.tube((x,0,0.33),(x,0,0.05),0.012,6,BRONZE,r1=0.03)
        mb.tube((0,0,2.5),(0,0,2.9),0.006,4,METAL)
    deco("IC18_Banner_Hanging",banner,"hanging fabric banner with abstract bronze disc (no text), origin = hook")
    def noren(mb):
        mb.tube((-0.95,0,2.3),(0.95,0,2.3),0.02,8,W_DARK)
        for k in range(3):
            x=-0.62+0.62*k
            mb.box((x,0,1.75),(0.6,0.01,1.1),FABRIC,grain=2)
            mb.box((x,0,2.25),(0.6,0.03,0.08),FABRIC,grain=0)
    deco("IC18_Noren_Curtain",noren,"split doorway curtain, 3 panels")
    def rosette(mb):
        mb.lathe((0,0,0),[(0.09,0.0),(0.1,0.01),(0.06,0.03),(0.02,0.045)],12,BRONZE,R=L.rot(-90,0,0))
        for k in range(6):
            a=math.radians(60*k)
            mb.lathe((0.07*math.cos(a),-0.012,0.07*math.sin(a)),[(0.035,0.0),(0.035,0.012),(0.01,0.02)],8,BRONZE,R=L.rot(-90,0,0))
    deco("IC18_Wall_Ornament_Rosette",rosette,"bronze kugikakushi nail cover, origin = wall face (-Y out)")
    def trim(mb):
        mb.box((1.2,0,0.03),(2.4,0.08,0.06),W_DARK,grain=0); mb.box((1.2,0,0.37),(2.4,0.08,0.06),W_DARK,grain=0)
        diamonds(mb,0.0,2.4,0.06,0.34,s=0.12)
        for x in (0.0,2.4): mb.box((x,0,0.2),(0.06,0.08,0.4),W_DARK,grain=2)
    deco("IC18_Trim_Carved_Lattice",trim,"decorative lattice trim strip 2.4 x 0.4")
    def kakejiku(mb):
        mb.box((0,0,1.0),(0.5,0.01,1.4),L.LPAPER,grain=2)
        mb.box((0,-0.002,1.0),(0.56,0.008,1.6),FABRIC,grain=2)
        mb.tube((-0.31,0,1.82),(0.31,0,1.82),0.012,8,W_DARK); mb.tube((-0.33,0,0.18),(0.33,0,0.18),0.018,8,W_DARK)
    deco("IC18_Hanging_Scroll",kakejiku,"blank hanging scroll (no calligraphy)")

def bg_tier(mb, s, z, h, nwin, roof=True, rr=1.3):
    mb.box((0,0,z+h/2),(s,s,h),BG)
    for side in range(4):
        with mb.at((0,0,0),rz=90*side):
            for k in range(nwin):
                x=-s/2+s*(k+0.5)/nwin
                mb.box((x,-s/2-0.02,z+h*0.55),(s/nwin*0.55,0.04,h*0.42),EMIT)
            mb.box((0,-s/2-0.4,z),(s+0.8,0.8,0.12),BG)
    if roof: mb.hip([(s/2*rr,s/2*rr,z+h),(s*0.18,s*0.18,z+h+s*0.38)],0.12,BG)

def build_background():
    def bg(name, fn, note):
        r=L.asset_root(name,19,{"lod":"distant","note":note}); mb=MB(L.seed(name)); fn(mb); L.part(r,"Mesh",mb); return r
    def tower(tiers, s0, name):
        def f(mb):
            z=0.0; s=s0
            for t in range(tiers):
                bg_tier(mb,s,z,3.2,max(2,int(s/2)),roof=True)
                z+=3.2+s*0.14; s*=0.84
            mb.box((0,0,-1.5),(s0*0.9,s0*0.9,3.0),BG)
            for x in (-s0*0.4,s0*0.4):
                for y in (-s0*0.4,s0*0.4): mb.box((x,y,-4.5),(0.4,0.4,6.0),BG)
        bg(name,f,f"{tiers}-tier pagoda silhouette")
    tower(2,8.0,"IC19_BG_Tower_S"); tower(3,10.0,"IC19_BG_Tower_M"); tower(5,12.0,"IC19_BG_Tower_L")
    def wide(mb):
        for k,(x,z) in enumerate(((0,0),(4,3.6))):
            mb.box((x,0,z+1.6),(16-4*k,6,3.2),BG)
            for i in range(int((16-4*k)/1.6)):
                xx=x-(16-4*k)/2+1.6*(i+0.5)
                mb.box((xx,-3.02,z+1.75),(0.9,0.04,1.3),EMIT)
            mb.box((x,-3.4,z),(16-4*k+0.4,0.8,0.1),BG)
        with mb.at((4,0,0),rz=90): mb.gable(13.0,[(3.6,7.2),(0.0,8.9)],0.12,BG)
    bg("IC19_BG_Block_Wide",wide,"wide 2-storey block with window rows")
    def balcony_row(mb):
        for k in range(6):
            x=-10+4*k
            mb.box((x,0,1.6),(3.8,4.0,3.2),BG)
            mb.box((x,-2.2,1.9),(2.0,0.04,1.4),EMIT)
            mb.box((x,-3.0,0.0),(4.0,2.0,0.12),BG)
            mb.box((x,-3.95,0.55),(4.0,0.06,0.08),BG)
            for xx in (x-1.9,x+1.9): mb.box((xx,-3.95,0.3),(0.08,0.08,0.6),BG)
        mb.box((0,0,3.35),(24.4,5.0,0.3),BG)
        mb.box((0,-3.0,-1.2),(24.0,0.2,0.3),BG)
    bg("IC19_BG_Balcony_Row",balcony_row,"24 m strip of repeating balconies")
    def corridor(mb):
        mb.box((0,16,1.6),(3.4,32,3.2),BG)
        for k in range(16):
            for sx in (-1,1): mb.box((sx*1.72,1+2*k,1.4),(0.04,1.6,1.8),EMIT if k%3 else BG)
        with mb.at((0,16,3.2)): mb.gable(32.6,[(2.3,0.0),(0.0,1.0)],0.1,BG)
        for k in range(9): mb.box((0,4*k,-1.0),(0.25,0.25,2.0),BG)
    bg("IC19_BG_Corridor_Distant",corridor,"32 m distant corridor with window strip")
    def cluster(mb):
        for (x,y,z,s) in ((0,0,0,6),(5,3,4.2,5),(-3,4,8.4,4.5),(2,-2,12.2,4)):
            with mb.at((x,y,z)): bg_tier(mb,s,0,3.2,3,roof=(z>10))
            mb.box((x,y,z-0.2),(s+2,s+2,0.2),BG)
        for x,y in ((-3,-3),(3,-3),(3,3),(-3,3)): mb.box((x,y,-3),(0.35,0.35,6),BG)
    bg("IC19_BG_Suspended_Cluster",cluster,"stacked suspended blocks")

def build_void():
    rnd=random.Random(2020)
    def vp(name, fn, note):
        r=L.asset_root(name,20,{"note":note}); mb=MB(L.seed(name)); fn(mb); L.part(r,"Mesh",mb); return r
    def planks(mb):
        for k in range(7):
            mb.box((rnd.uniform(-1.5,1.5),rnd.uniform(-1.0,1.0),rnd.uniform(-0.8,0.8)),(rnd.uniform(0.9,2.2),0.22,0.05),W_AGED,
                   R=L.rot(rnd.uniform(-35,35),rnd.uniform(-25,25),rnd.uniform(0,180)),grain=0)
    vp("IC20_Floating_Planks",planks,"cluster of loose deck planks")
    def broken(mb):
        pts=[(0,0.16),(2.2,0.16),(2.35,0.05),(2.25,-0.02),(2.5,-0.08),(2.3,-0.16),(0,-0.16)]
        mb.slab([(x,0.1,z) for x,z in pts][::-1],0.2,W_DARK,grain=(1,0,0))
        for k in range(4):
            mb.box((2.3+rnd.uniform(0.1,0.6),rnd.uniform(-0.2,0.2),rnd.uniform(-0.3,0.3)),(rnd.uniform(0.08,0.2),0.05,0.04),W_DARK,R=L.rot(rnd.uniform(0,90),rnd.uniform(0,90),rnd.uniform(0,90)))
    vp("IC20_Broken_Beam",broken,"snapped beam with splinters")
    def railfrag(mb):
        with mb.at((0,0,0),ry=8): mb.railing((0,0,0),(2.4,0,0),post_ts=(0.0,0.5),ps=0.11)
        mb.box((2.4,0,0.25),(0.11,0.11,0.5),W_DARK,grain=2)
        mb.box((0.0,0,-0.03),(2.6,0.3,0.06),W_AGED,R=L.rot(0,8,0))
    vp("IC20_Railing_Fragment",railfrag,"isolated railing section, broken end")
    def debris(mb):
        for k in range(18):
            s=rnd.uniform(0.06,0.35)
            mb.box((rnd.uniform(-1.6,1.6),rnd.uniform(-1.6,1.6),rnd.uniform(-1.2,1.2)),(s*rnd.uniform(1,3),s,s*rnd.uniform(0.3,1)),
                   rnd.choice([W_DARK,W_AGED,W_AGED]),R=L.rot(rnd.uniform(0,360),rnd.uniform(0,360),rnd.uniform(0,360)))
    vp("IC20_Debris_Small",debris,"small architectural debris cloud")
    def frame_piece(mb):
        with mb.at((0,0,0),rx=12,ry=-18,rz=20):
            mb.box((0,0,1.4),(0.3,0.3,2.8),W_DARK,grain=2)
            mb.box((1.6,0,2.7),(3.2,0.2,0.3),W_DARK,grain=0)
            mb.beam((0.15,0,1.7),(1.1,0,2.55),0.1,0.14,W_DARK)
            mb.box((0,0,2.95),(0.46,0.46,0.2),W_DARK)
    vp("IC20_Suspended_Frame_Piece",frame_piece,"tilted pillar/beam/brace fragment")
    def stairfrag(mb):
        with mb.at((0,0,0),rx=-10,rz=15):
            for i in range(6):
                mb.box((0,i/3.0,0.15*(i+1)-0.025),(2.0,0.36,0.05),W_AGED,grain=0)
            for sx in (-1,1): mb.beam((sx*1.05,-0.2,0.0),(sx*1.05,2.0,1.0),0.08,0.34,W_DARK)
    vp("IC20_Stair_Fragment",stairfrag,"floating chunk of stair")
    def lone_lantern_chain(mb):
        mb.tube((0,0,-3.0),(0,0,0),0.01,6,METAL)
        for k in range(10): mb.lathe((0,0,-0.3*k-0.15),[(0.02,-0.04),(0.02,0.04)],6,METAL)
    r=vp("IC20_Hanging_Chain_Lantern",lone_lantern_chain,"3 m chain with lantern for the void")
    L.inst("IC10_Lantern_Hanging_Hex",r,r.name+"__Lantern",(0,0,-3.0))

def run():
    build_walls(); build_windows(); build_ceilings(); build_floors(); build_decor(); build_background(); build_void()
