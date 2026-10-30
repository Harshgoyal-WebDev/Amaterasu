# ic_lib.py - Infinity Castle asset library helpers (Blender 5.x)
import bpy, bmesh, math, random, os
import numpy as np
from mathutils import Vector, Matrix
from contextlib import contextmanager

ROOT_DIR = "/Users/harshgoyal/Documents/GitHub/Amaterasu/blender/infinity_castle"
TEX_DIR = ROOT_DIR + "/textures"
EXPORT_DIR = ROOT_DIR + "/exports"

# ---------------- project standards (metres) ----------------
G = 4.0          # base grid / module length
STORY = 3.6      # floor-to-floor height
CLEAR_H = 3.0    # interior clear height
OPEN_W = 2.4     # standard connection clear width (doors, bridges, stairs)
POST = 0.2       # standard post section
RAIL_H = 1.0     # railing height

COLLS = ["00_Reference","01_Entrance_Gateway","02_Shoji_Door_Modules","03_Tatami_Room_Modules",
 "04_Corridor_Modules","05_Staircase_Modules","06_Inverted_Architecture","07_Bridges_and_Walkways",
 "08_Balcony_Platforms","09_Timber_Structures","10_Lanterns","11_Exterior_Room_Blocks",
 "12_Central_Abyss_Cluster","13_Infinite_Crossroads","14_Wall_Panels","15_Windows_and_Openings",
 "16_Ceiling_Modules","17_Floor_Modules","18_Decorative_Elements","19_Background_Architecture",
 "20_Void_Props","90_Asset_Presentation"]
EXPORT_NAMES = {1:"entrance_gateway",2:"shoji_door_modules",3:"tatami_room_modules",4:"corridor_modules",
 5:"staircase_modules",6:"inverted_architecture",7:"bridges_walkways",8:"balcony_platforms",
 9:"timber_structures",10:"lanterns",11:"exterior_room_blocks",12:"central_abyss_cluster",
 13:"infinite_crossroads",14:"wall_panels",15:"windows_openings",16:"ceiling_modules",17:"floor_modules",
 18:"decorative_elements",19:"background_architecture",20:"void_props"}

W_DARK="M_Wood_Dark_Cedar"; W_AGED="M_Wood_Aged_Brown"; W_POL="M_Wood_Polished"
PAPER="M_Shoji_Paper"; PAPER_LIT="M_Shoji_Paper_Glow"; TATAMI="M_Tatami"; METAL="M_Dark_Metal"
LPAPER="M_Lantern_Paper"; EMIT="M_Lantern_Amber_Emissive"; BRONZE="M_Decorative_Bronze"
BG="M_Background_Dark"; FABRIC="M_Fabric_Banner"

TEX_SCALE = {W_DARK:1.5, W_AGED:1.5, W_POL:1.5, PAPER:1.2, PAPER_LIT:1.2, LPAPER:0.5, EMIT:0.5, TATAMI:2.0}
def tscale(m): return TEX_SCALE.get(m, 1.0)

def rot(rx=0.0, ry=0.0, rz=0.0):
    return (Matrix.Rotation(math.radians(rz),3,'Z') @ Matrix.Rotation(math.radians(ry),3,'Y')
            @ Matrix.Rotation(math.radians(rx),3,'X'))

FACE_AX = {0:(1,2), 1:(2,0), 2:(0,1)}

class MB:
    """Mesh builder: boxes/slabs/lathes with UVs + material slots, merged into one mesh."""
    def __init__(self, seed=1):
        self.bm = bmesh.new()
        self.uvl = self.bm.loops.layers.uv.new("UVMap")
        self.mats = []
        self.rng = random.Random(seed)
        self.M = Matrix.Identity(4)
    def mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    @contextmanager
    def at(self, loc=(0,0,0), rz=0.0, rx=0.0, ry=0.0):
        old = self.M
        self.M = old @ (Matrix.Translation(Vector(loc)) @ rot(rx,ry,rz).to_4x4())
        try: yield
        finally: self.M = old
    def _p(self, p): return self.M @ Vector(p)
    def _R(self, R): return self.M.to_3x3() @ (R if R is not None else Matrix.Identity(3))
    def face(self, vs, uvs, m):
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        f.material_index = self.mi(m)
        for l, uv in zip(f.loops, uvs): l[self.uvl].uv = uv
        return f
    def box(self, c, s, m, R=None, grain=None, fit=False, skip=()):
        if min(s) <= 0: return
        c = self._p(c); R = self._R(R)
        ax = (R.col[0].copy(), R.col[1].copy(), R.col[2].copy())
        h = (s[0]*0.5, s[1]*0.5, s[2]*0.5)
        vd = {}
        for i in (-1,1):
            for j in (-1,1):
                for k in (-1,1):
                    vd[(i,j,k)] = self.bm.verts.new(c + ax[0]*(i*h[0]) + ax[1]*(j*h[1]) + ax[2]*(k*h[2]))
        g = grain if grain is not None else max(range(3), key=lambda a: s[a])
        T = tscale(m); ou = self.rng.random()*7.0; ov = self.rng.random()*7.0
        for n in range(3):
            a, b = FACE_AX[n]
            ua = g if g in (a,b) else (a if s[a] >= s[b] else b)
            va = b if ua == a else a
            for sg in (-1,1):
                if (n,sg) in skip: continue
                quad = [(-1,-1),(1,-1),(1,1),(-1,1)]
                if sg < 0: quad = quad[::-1]
                vs=[]; uvs=[]
                for qa, qb in quad:
                    idx=[0,0,0]; idx[n]=sg; idx[a]=qa; idx[b]=qb
                    vs.append(vd[tuple(idx)])
                    if fit: uvs.append(((idx[ua]+1)*0.5, (idx[va]+1)*0.5))
                    else: uvs.append((idx[ua]*h[ua]/T+ou, idx[va]*h[va]/T+ov))
                self.face(vs, uvs, m)
    def post(self, x, y, z0, z1, m=W_DARK, s=POST):
        self.box((x,y,(z0+z1)*0.5), (s,s,z1-z0), m, grain=2)
    def beam(self, p0, p1, w, h, m=W_DARK, ext=0.0, up=None):
        p0=Vector(p0); p1=Vector(p1); d=p1-p0; L=d.length
        if L < 1e-6: return
        x = d/L
        upv = Vector(up) if up else (Vector((0,0,1)) if abs(x.z) < 0.98 else Vector((0,1,0)))
        y = upv.cross(x)
        if y.length < 1e-6: y = Vector((1,0,0)).cross(x)
        y.normalize(); z = x.cross(y)
        R = Matrix((x,y,z)).transposed()
        self.box((p0+p1)*0.5, (L+2*ext, w, h), m, R=R, grain=0)
    def slab(self, pts, t, m, grain=None):
        P=[]
        for p in pts:
            v=self._p(p)
            if not P or (v-P[-1]).length > 1e-6: P.append(v)
        if len(P) > 2 and (P[0]-P[-1]).length < 1e-6: P.pop()
        if len(P) < 3: return
        n=Vector((0,0,0))
        for i in range(len(P)):
            a=P[i]; b=P[(i+1)%len(P)]
            n.x += (a.y-b.y)*(a.z+b.z); n.y += (a.z-b.z)*(a.x+b.x); n.z += (a.x-b.x)*(a.y+b.y)
        if n.length < 1e-9: return
        n.normalize()
        gd = (self.M.to_3x3() @ Vector(grain)) if grain is not None else (P[1]-P[0])
        u = gd - n*gd.dot(n)
        if u.length < 1e-6:
            u = P[1]-P[0]; u = u - n*u.dot(n)
        u.normalize(); v = n.cross(u)
        T=tscale(m); ou=self.rng.random()*7; ov=self.rng.random()*7
        top=[self.bm.verts.new(p) for p in P]; bot=[self.bm.verts.new(p-n*t) for p in P]
        uvt=[(p.dot(u)/T+ou, p.dot(v)/T+ov) for p in P]
        self.face(top, uvt, m)
        self.face(bot[::-1], uvt[::-1], m)
        k=len(P)
        for i in range(k):
            j=(i+1)%k; el=(P[j]-P[i]).length
            self.face([bot[i],bot[j],top[j],top[i]], [(ou,ov),(el/T+ou,ov),(el/T+ou,t/T+ov),(ou,t/T+ov)], m)
    def lathe(self, c, prof, seg, m, R=None, cap=True):
        """prof: list of (r,z) with z increasing (bottom->top)."""
        c=self._p(c); R=self._R(R); T=tscale(m)
        rings=[]
        for (r,z) in prof:
            r=max(r,0.0008)
            rings.append([self.bm.verts.new(c + R @ Vector((r*math.cos(2*math.pi*i/seg), r*math.sin(2*math.pi*i/seg), z))) for i in range(seg)])
        for k in range(len(prof)-1):
            z0=prof[k][1]; z1=prof[k+1][1]
            for i in range(seg):
                j=(i+1)%seg
                self.face([rings[k][i],rings[k][j],rings[k+1][j],rings[k+1][i]],
                          [(i/seg,z0/T),((i+1)/seg,z0/T),((i+1)/seg,z1/T),(i/seg,z1/T)], m)
        if cap:
            cuv=[(0.5+0.5*math.cos(2*math.pi*i/seg),0.5+0.5*math.sin(2*math.pi*i/seg)) for i in range(seg)]
            if prof[0][0] > 0.002: self.face(rings[0][::-1], cuv[::-1], m)
            if prof[-1][0] > 0.002: self.face(rings[-1], cuv, m)
    def tube(self, p0, p1, r, seg, m, r1=None):
        p0=Vector(p0); p1=Vector(p1); d=p1-p0; L=d.length
        if L < 1e-6: return
        z=d/L; x=Vector((1,0,0)) if abs(z.x) < 0.9 else Vector((0,1,0))
        x=(x - z*x.dot(z)).normalized(); y=z.cross(x)
        self.lathe(p0, [(r,0.0),(r if r1 is None else r1, L)], seg, m, R=Matrix((x,y,z)).transposed())
    def hip(self, rings, t, m, ridges=None, ridge_w=0.1):
        """rings: [(hx,hy,z),...] eave->top. Four trapezoid slabs per tier (hip roof)."""
        for k in range(len(rings)-1):
            hx0,hy0,z0=rings[k]; hx1,hy1,z1=rings[k+1]
            c0=[(-hx0,-hy0,z0),(hx0,-hy0,z0),(hx0,hy0,z0),(-hx0,hy0,z0)]
            c1=[(-hx1,-hy1,z1),(hx1,-hy1,z1),(hx1,hy1,z1),(-hx1,hy1,z1)]
            for s in range(4):
                j=(s+1)%4
                g=(Vector(c1[s])+Vector(c1[j]))*0.5-(Vector(c0[s])+Vector(c0[j]))*0.5
                self.slab([c0[s],c0[j],c1[j],c1[s]], t, m, grain=g)
                if ridges: self.beam(c0[s], c1[s], ridge_w, ridge_w, ridges)
        hx,hy,z=rings[-1]
        if ridges and hx > 0.05 and abs(hx-hy) > 0.05:
            if hx > hy: self.beam((-hx,0,z),(hx,0,z),ridge_w*1.4,ridge_w*1.4,ridges)
            else: self.beam((0,-hy,z),(0,hy,z),ridge_w*1.4,ridge_w*1.4,ridges)
    def gable(self, L, prof, t, m, barge=None, barge_w=0.08, barge_h=0.3):
        """Roof along Y (length L). prof: [(x,z),...] from eave (x>0) to ridge (x=0)."""
        for k in range(len(prof)-1):
            x0,z0=prof[k]; x1,z1=prof[k+1]
            self.slab([(x0,-L/2,z0),(x0,L/2,z0),(x1,L/2,z1),(x1,-L/2,z1)], t, m, grain=(x1-x0,0,z1-z0))
            self.slab([(-x0,L/2,z0),(-x0,-L/2,z0),(-x1,-L/2,z1),(-x1,L/2,z1)], t, m, grain=(x0-x1,0,z1-z0))
            if barge:
                for yy in (-L/2, L/2):
                    for sx in (1,-1):
                        self.beam((sx*x0,yy,z0+0.02),(sx*x1,yy,z1+0.02), barge_w, barge_h, barge, ext=0.03)
        if barge:
            zr=prof[-1][1]
            self.beam((0,-L/2,zr+0.05),(0,L/2,zr+0.05),0.18,0.16,barge,ext=0.1)
    def railing(self, p0, p1, post_ts=(0.0,1.0), h=RAIL_H, m=W_DARK, strut=0.5, finial=False, ps=0.11, cap_ext=0.04):
        p0=Vector(p0); p1=Vector(p1); d=p1-p0; L=d.length
        if L < 1e-4: return
        rz=math.degrees(math.atan2(d.y,d.x)); R=rot(0,0,rz)
        for t in post_ts:
            p=p0+d*t
            self.box((p.x,p.y,p.z+h*0.5),(ps,ps,h),m,R=R,grain=2)
            if finial: giboshi(self, (p.x,p.y,p.z+h), ps*0.55)
        up=Vector((0,0,1))
        self.beam(p0+up*(h+0.035), p1+up*(h+0.035), ps*0.95, 0.07, m, ext=cap_ext)
        self.beam(p0+up*(h*0.55), p1+up*(h*0.55), 0.055, 0.05, m)
        self.beam(p0+up*0.12, p1+up*0.12, 0.06, 0.06, m)
        n=max(1,int(L/strut))
        for i in range(n):
            t=(i+0.5)/n; p=p0+d*t
            if any(abs(t-pt)*L < 0.12 for pt in post_ts): continue
            self.box((p.x,p.y,p.z+(0.12+h*0.55)*0.5),(0.045,0.045,h*0.55-0.12),m,R=R,grain=2)

def giboshi(mb, base, r=0.06):
    k=r/0.06
    prof=[(0.062,0.0),(0.066,0.025),(0.05,0.045),(0.058,0.07),(0.068,0.1),(0.058,0.135),(0.03,0.17),(0.012,0.2),(0.004,0.23)]
    mb.lathe(base, [(a*k,b*k) for a,b in prof], 10, BRONZE)

# ---------------- datablock helpers ----------------
def coll(n):
    name = (COLLS[-1] if n == 90 else COLLS[n]) if isinstance(n,int) else n
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.data.scenes["IC_Library"].collection.children.link(c)
    return c

def kill(name):
    ob = bpy.data.objects.get(name)
    if ob is None: return
    for ch in list(ob.children): kill(ch.name)
    bpy.data.objects.remove(ob, do_unlink=True)

def mk(name, mb, c, parent=None, loc=(0,0,0), rot_deg=(0,0,0)):
    if isinstance(c,int): c=coll(c)
    me = bpy.data.meshes.new(name)
    mb.bm.normal_update(); mb.bm.to_mesh(me); mb.bm.free()
    for m in mb.mats: me.materials.append(bpy.data.materials[m])
    ob = bpy.data.objects.new(name, me); c.objects.link(ob)
    ob.parent = parent; ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot_deg]
    return ob

def empty(name, c, parent=None, loc=(0,0,0), rot_deg=(0,0,0), kind='PLAIN_AXES', size=0.5, props=None):
    if isinstance(c,int): c=coll(c)
    ob = bpy.data.objects.new(name, None); c.objects.link(ob)
    ob.empty_display_type = kind; ob.empty_display_size = size
    ob.parent = parent; ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot_deg]
    for k,v in (props or {}).items(): ob[k] = v
    return ob

def asset_root(name, cat, props=None):
    kill(name)
    p = {"ic_category": COLLS[cat], "units": "metres", "grid": G, "story": STORY}
    p.update(props or {})
    return empty(name, cat, None, (0,0,0), (0,0,0), 'PLAIN_AXES', 0.6, p)

def part(root, suffix, mb, loc=(0,0,0), rot_deg=(0,0,0), props=None):
    ob = mk(root.name+"__"+suffix, mb, root.users_collection[0], root, loc, rot_deg)
    for k,v in (props or {}).items(): ob[k]=v
    return ob

def socket(root, name, loc, rot_deg=(0,0,0), parent=None):
    return empty(root.name+"__SOCKET_"+name, root.users_collection[0], parent or root, loc, rot_deg, 'SINGLE_ARROW', 0.45, {"ic_socket": name})

def anchor(root, loc, parent=None, name="LightAnchor"):
    return empty(root.name+"__"+name, root.users_collection[0], parent or root, loc, (0,0,0), 'SPHERE', 0.08, {"ic_light_anchor": 1})

def inst(src, parent, name, loc=(0,0,0), rot_deg=(0,0,0), c=None, sockets=False):
    if isinstance(src,str): src = bpy.data.objects[src]
    if c is None: c = parent.users_collection[0] if parent else src.users_collection[0]
    if isinstance(c,int): c=coll(c)
    ob = bpy.data.objects.new(name, src.data)
    if src.type == 'EMPTY':
        ob.empty_display_type = src.empty_display_type; ob.empty_display_size = src.empty_display_size
        for k in src.keys():
            if k.startswith("ic_light"): ob[k]=src[k]
    c.objects.link(ob)
    ob.parent = parent; ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot_deg]
    for ch in src.children:
        if "__SOCKET_" in ch.name and not sockets: continue
        inst(ch, ob, name+"__"+ch.name.split("__")[-1], tuple(ch.location),
             [math.degrees(a) for a in ch.rotation_euler], c, sockets)
    return ob

# ---------------- textures & materials ----------------
def _noise(sx, sy, cx, cy, rng):
    cx=max(1,min(int(cx),sx)); cy=max(1,min(int(cy),sy))
    g=rng.random((cy,cx))
    xs=np.arange(sx)*cx/sx; ys=np.arange(sy)*cy/sy
    x0=np.floor(xs).astype(int); y0=np.floor(ys).astype(int)
    fx=xs-x0; fy=ys-y0; fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy)
    x1=(x0+1)%cx; y1=(y0+1)%cy
    a=g[np.ix_(y0,x0)]; b=g[np.ix_(y0,x1)]; c=g[np.ix_(y1,x0)]; d=g[np.ix_(y1,x1)]
    fx=fx[None,:]; fy=fy[:,None]
    return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy

def fbm(sx, sy, cx, cy, octv, rng, gain=0.5):
    t=np.zeros((sy,sx)); amp=1.0; nrm=0.0
    for o in range(octv):
        t+=amp*_noise(sx,sy,cx*2**o,cy*2**o,rng); nrm+=amp; amp*=gain
    return t/nrm

def _nrm(h, s):
    dx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))*s
    dy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))*s
    n=np.stack([-dx,-dy,np.ones_like(h)],axis=-1)
    n/=np.linalg.norm(n,axis=-1,keepdims=True)
    return n*0.5+0.5

def _save(fname, rgb, noncolor=False):
    os.makedirs(TEX_DIR, exist_ok=True)
    H,W=rgb.shape[:2]; path=os.path.join(TEX_DIR,fname)
    tmp=bpy.data.images.new("__tmp_"+fname, W, H, alpha=False)
    rgba=np.ones((H,W,4),dtype=np.float32); rgba[...,:3]=np.clip(rgb,0,1)
    tmp.pixels.foreach_set(rgba.ravel())
    tmp.filepath_raw=path; tmp.file_format='PNG'; tmp.save()
    bpy.data.images.remove(tmp)
    old=bpy.data.images.get(fname)
    if old: bpy.data.images.remove(old)
    img=bpy.data.images.load(path); img.name=fname
    img.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    return img

def gen_textures():
    T={}
    S=1024; rng=np.random.default_rng(42)
    y=(np.arange(S)/S)[:,None]
    warp=fbm(S,S,2,3,4,rng); warp2=fbm(S,S,4,16,4,rng)
    t=y*26+warp*1.4+warp2*0.35
    f=t-np.floor(t)
    late=np.clip((f-0.5)/0.5,0,1)**1.5
    fib=fbm(S,S,3,192,3,rng); fine=fbm(S,S,6,512,2,rng)
    pores=np.clip((fine-0.7)*5,0,1); big=fbm(S,S,2,2,3,rng)
    tone=np.clip(0.5*late+0.45*(fib-0.5)+0.25*pores+0.4*(big-0.5)+0.22,0,1)
    height=1.0-(0.55*late+0.25*pores+0.2*fib)
    pal={"wood_cedar":((0.30,0.155,0.085),(0.075,0.036,0.02)),
         "wood_aged":((0.30,0.205,0.13),(0.095,0.066,0.046)),
         "wood_polished":((0.40,0.19,0.08),(0.10,0.042,0.018))}
    for k,(lc,dc) in pal.items():
        lc=np.array(lc); dc=np.array(dc)
        rgb=lc*(1-tone[...,None])+dc*tone[...,None]
        rgb=rgb*(0.9+0.2*fine[...,None])
        T[k]=_save(k+"_basecolor.png", rgb)
    rough=np.clip(0.55+0.2*late+0.12*(fib-0.5)+0.1*pores,0,1)
    T["wood_rough"]=_save("wood_roughness.png", np.repeat(rough[...,None],3,axis=2), True)
    T["wood_normal"]=_save("wood_normal.png", _nrm(height,5.0), True)
    # tatami (U = mat length)
    W,H=1024,512; rng=np.random.default_rng(7)
    v=(np.arange(H)/H)[:,None]; u=(np.arange(W)/W)[None,:]
    jit=fbm(W,H,6,4,3,rng)
    rush=0.5+0.5*np.sin(2*np.pi*(v*90+jit*1.5))
    stitch=np.broadcast_to((0.5+0.5*np.cos(2*np.pi*u*40))**10,(H,W))
    grain=fbm(W,H,96,24,3,rng); mottle=fbm(W,H,3,2,4,rng)
    tone=np.clip(0.45*rush+0.2*stitch+0.25*grain+0.5*(mottle-0.5),0,1)
    lc=np.array([0.47,0.41,0.23]); dc=np.array([0.27,0.22,0.11])
    rgb=lc*(1-tone[...,None])+dc*tone[...,None]
    heri=np.broadcast_to((v<0.07)|(v>0.93),(H,W))
    hn=fbm(W,H,128,16,2,rng)
    heri_rgb=np.array([0.07,0.045,0.03])[None,None,:]*(0.75+0.5*hn[...,None])
    rgb=np.where(heri[...,None],heri_rgb,rgb)
    hgt=np.where(heri,0.2,0.6*rush+0.25*(1-stitch)+0.15*grain)
    T["tatami"]=_save("tatami_basecolor.png", rgb)
    T["tatami_n"]=_save("tatami_normal.png", _nrm(hgt,2.5), True)
    # papers (512)
    S2=512; rng=np.random.default_rng(11)
    fibers=fbm(S2,S2,8,8,6,rng,0.6); streak=fbm(S2,S2,4,64,3,rng)
    mod=(0.88+0.16*fibers[...,None]+0.06*streak[...,None])
    T["shoji"]=_save("shoji_paper_basecolor.png", np.array([0.80,0.75,0.62])*mod)
    T["shoji_glow"]=_save("shoji_paper_emissive.png", np.array([1.0,0.62,0.30])*(0.7+0.4*fibers[...,None]))
    T["lpaper"]=_save("lantern_paper_basecolor.png", np.array([0.80,0.58,0.34])*mod)
    T["lemit"]=_save("lantern_emissive.png", np.array([1.0,0.46,0.11])*(0.65+0.45*fibers[...,None]+0.1*streak[...,None]))
    return T

def _mat(name, base=(0.5,0.5,0.5), base_img=None, rough=0.6, rough_img=None, nrm_img=None, nstr=1.0,
         metal=0.0, emit_img=None, emit_col=None, emit_str=0.0, view=None, transmission=0.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True; nt=m.node_tree; nt.nodes.clear()
    out=nt.nodes.new('ShaderNodeOutputMaterial'); out.location=(400,0)
    p=nt.nodes.new('ShaderNodeBsdfPrincipled'); p.location=(100,0)
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    def img(i, loc):
        n=nt.nodes.new('ShaderNodeTexImage'); n.image=i; n.location=loc; return n
    if base_img: nt.links.new(img(base_img,(-450,350)).outputs['Color'], p.inputs['Base Color'])
    else: p.inputs['Base Color'].default_value=(*base,1)
    if rough_img: nt.links.new(img(rough_img,(-450,50)).outputs['Color'], p.inputs['Roughness'])
    else: p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    if transmission: p.inputs['Transmission Weight'].default_value=transmission
    if nrm_img:
        nm=nt.nodes.new('ShaderNodeNormalMap'); nm.location=(-150,-300); nm.inputs['Strength'].default_value=nstr
        nt.links.new(img(nrm_img,(-450,-300)).outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if emit_img is not None or emit_col is not None:
        if emit_img is not None: nt.links.new(img(emit_img,(-450,-650)).outputs['Color'], p.inputs['Emission Color'])
        else: p.inputs['Emission Color'].default_value=(*emit_col,1)
        p.inputs['Emission Strength'].default_value=emit_str
    vc = view or base
    m.diffuse_color=(vc[0],vc[1],vc[2],1)
    return m

def seed(s):
    import zlib
    return zlib.crc32(s.encode()) % 99991

def build_materials():
    T=gen_textures()
    _mat(W_DARK, base_img=T["wood_cedar"], rough_img=T["wood_rough"], nrm_img=T["wood_normal"], nstr=0.6, view=(0.12,0.055,0.03))
    _mat(W_AGED, base_img=T["wood_aged"], rough_img=T["wood_rough"], nrm_img=T["wood_normal"], nstr=0.8, view=(0.14,0.09,0.06))
    _mat(W_POL, base_img=T["wood_polished"], rough=0.32, nrm_img=T["wood_normal"], nstr=0.35, view=(0.16,0.06,0.025))
    _mat(PAPER, base_img=T["shoji"], rough=0.85, transmission=0.15, view=(0.6,0.55,0.42))
    _mat(PAPER_LIT, base_img=T["shoji"], rough=0.85, emit_img=T["shoji_glow"], emit_str=1.4, view=(0.9,0.55,0.25))
    _mat(TATAMI, base_img=T["tatami"], rough=0.8, nrm_img=T["tatami_n"], nstr=0.7, view=(0.4,0.34,0.18))
    _mat(METAL, base=(0.02,0.018,0.016), metal=0.85, rough=0.5)
    _mat(LPAPER, base_img=T["lpaper"], rough=0.8, view=(0.6,0.4,0.2))
    _mat(EMIT, base_img=T["lpaper"], rough=0.8, emit_img=T["lemit"], emit_str=4.0, view=(1.0,0.45,0.1))
    _mat(BRONZE, base=(0.20,0.105,0.045), metal=1.0, rough=0.42)
    _mat(BG, base=(0.012,0.009,0.007), rough=0.9)
    _mat(FABRIC, base=(0.16,0.025,0.018), rough=0.9)
    for m in bpy.data.materials:
        if m.name.startswith('M_'): m.use_fake_user = True


def _desc(ob):
    out=[]
    for ch in ob.children:
        out.append(ch); out+= _desc(ch)
    return out

def rel_bbox(root):
    inv=root.matrix_world.inverted()
    mn=Vector((1e9,1e9,1e9)); mx=Vector((-1e9,-1e9,-1e9))
    for o in _desc(root):
        if o.type!='MESH': continue
        M=inv@o.matrix_world
        for c in o.bound_box:
            v=M@Vector(c)
            mn=Vector((min(mn.x,v.x),min(mn.y,v.y),min(mn.z,v.z))); mx=Vector((max(mx.x,v.x),max(mx.y,v.y),max(mx.z,v.z)))
    if mn.x>mx.x: return Vector((0,0,0)),Vector((0,0,0))
    return mn,mx

def layout(gap=2.5, row_gap=8.0, cats=range(1,21), skip_big=(12,13)):
    """Showcase layout: one row per category along +X, rows stacked along -Y. Big compositions placed far away."""
    bpy.context.view_layer.update()
    y=0.0
    for i in cats:
        c=bpy.data.collections.get(COLLS[i])
        if c is None: continue
        roots=sorted([o for o in c.objects if o.parent is None], key=lambda o:o.name)
        if not roots: continue
        if i in skip_big:
            for k,r in enumerate(roots):
                r.location=(-140.0 if i==12 else 140.0, 60.0, 0.0)
            continue
        boxes=[rel_bbox(r) for r in roots]
        depth=max(mx.y-mn.y for mn,mx in boxes)
        x=0.0
        for r,(mn,mx) in zip(roots,boxes):
            r.location=(x-mn.x, y-mx.y, 0.0)
            x+= (mx.x-mn.x)+gap
        y-= depth+row_gap
    bpy.context.view_layer.update()
