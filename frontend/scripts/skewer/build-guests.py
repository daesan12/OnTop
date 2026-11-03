"""Blender 5.x: editable, game-owned guest sculpts and shared rigid-part GLB.
Run: blender --background --factory-startup --python scripts/skewer/build-guests.py
Coordinates in this script use the game's X/right, Y/up, Z/front convention.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/art/skewer/characters'
SOURCE = ROOT / 'art-source/skewer'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
PALETTES = [
    ['ffcc9f','30282b','eab23f','343b51','e9ddc5'],
    ['ffd1ac','634337','76bca5','494442','eee4d8'],
    ['eebe96','3f3331','394d72','403d3c','634335'],
    ['f7c5a1','c8bcb7','a44c80','ba87a0','684455'],
    ['fac8a3','c2bab0','ba8a50','55503a','664735'],
    ['ffd0a7','82503a','468e8b','c5ae83','79523c'],
    ['bd7950','34282a','df745e','d9bb85','55a5a0'],
    ['ffd0ac','382b30','b380d5','6283a7','d95754'],
]
MATERIALS = {}
PARTS = {}
def xyz(p): return (p[0], -p[2], p[1])
def material(color, gloss=False):
    key = (color, gloss)
    if key not in MATERIALS:
        m = bpy.data.materials.new('guest_' + color + ('_gloss' if gloss else ''))
        m.use_nodes = True
        rgb = [int(color[i:i+2],16)/255 for i in (0,2,4)]
        linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*linear,1)
        bsdf.inputs['Roughness'].default_value = .23 if gloss else .68
        m.diffuse_color = (*linear,1)
        MATERIALS[key] = m
    return MATERIALS[key]
def finish(o, color, gloss=False):
    o.data.materials.append(material(color,gloss))
    for p in o.data.polygons: p.use_smooth = True
    PARTS[PART].append(o)
    return o
def ball(p,s,color,gloss=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=xyz(p))
    o=bpy.context.object; o.scale=(s[0],s[2],s[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,color,gloss)
def cushion(p,s,color,power=.8):
    # Continuous curved cheeks/body, without the flat faces of a beveled cube.
    verts=[];faces=[];rings=16;segments=24
    def signed(value): return math.copysign(abs(value)**power,value)
    for j in range(rings+1):
        latitude=-math.pi/2+math.pi*j/rings
        for i in range(segments):
            longitude=math.tau*i/segments
            verts.append(xyz((p[0]+s[0]*signed(math.cos(latitude))*signed(math.cos(longitude)),p[1]+s[1]*signed(math.sin(latitude)),p[2]+s[2]*signed(math.cos(latitude))*signed(math.sin(longitude)))))
    for j in range(rings):
        for i in range(segments): faces.append((j*segments+i,(j+1)*segments+i,(j+1)*segments+(i+1)%segments,j*segments+(i+1)%segments))
    mesh=bpy.data.meshes.new('rounded continuous surface');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('soft sculpt',mesh);bpy.context.collection.objects.link(o)
    return finish(o,color)
def box(p,s,color,r=.08):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p))
    o=bpy.context.object; o.scale=(s[0],s[2],s[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=o.modifiers.new('Soft tailored edge','BEVEL'); bevel.width=r; bevel.segments=3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    normal=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL'); normal.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=normal.name)
    return finish(o,color)
def stroke(points,r,color):
    curve=bpy.data.curves.new('rounded seam','CURVE');curve.dimensions='3D'
    curve.bevel_depth=r;curve.bevel_resolution=1;curve.resolution_u=8
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for bp,p in zip(spline.bezier_points,points):
        bp.co=xyz(p);bp.handle_left_type=bp.handle_right_type='AUTO'
    o=bpy.data.objects.new('seam',curve);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o=bpy.context.object
    return finish(o,color)
def lock(points,width,depth,color):
    # A swept, tapered lock with a rounded ridge, rather than overlapping balls.
    verts=[];faces=[];steps=9;sides=8
    a,b,c=[Vector(p) for p in points]
    for i in range(steps):
        t=i/(steps-1);p=(1-t)**2*a+2*(1-t)*t*b+t*t*c
        tangent=(2*(1-t)*(b-a)+2*t*(c-b)).normalized()
        across=Vector((-tangent.y,tangent.x,0)).normalized()
        factor=max(.025,math.sin(math.pi*t)**.65)
        for j in range(sides):
            angle=2*math.pi*j/sides
            q=p+across*(math.cos(angle)*width*factor)+Vector((0,0,math.sin(angle)*depth*factor))
            verts.append(xyz(q))
    for i in range(steps-1):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((steps-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new('swept hair');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('sculpted lock',mesh);bpy.context.collection.objects.link(o)
    return finish(o,color)
def glasses(color, square=False):
    for side in [-1,1]:
        cx=side*.195
        if square: pts=[(cx-.14,.13,.466),(cx+.14,.13,.466),(cx+.14,-.12,.466),(cx-.14,-.12,.466),(cx-.14,.13,.466)]
        else: pts=[(cx+math.cos(t*math.tau/12)*.142,.012+math.sin(t*math.tau/12)*.145,.47) for t in range(13)]
        stroke(pts,.017,color)
        stroke([(side*.34,.05,.46),(side*.48,.055,.10)],.016,color)
    stroke([(-.052,.04,.478),(0,.065,.49),(.052,.04,.478)],.016,color)

roots=[]
for v,(skin,hair,shirt,pants,shoes) in enumerate(PALETTES):
    def part(name):
        global PART
        PART=f'guest_{v}_{name}';PARTS[PART]=[]
    part('head')
    cushion((0,-.015,0),(.53,.445,.423),skin,.78)
    for side in [-1,1]:
        ball((side*.507,-.04,.015),(.093,.13,.09),skin)
        ball((side*.535,-.045,.075),(.035,.065,.023),'eeaa89')
        ball((side*.192,.005,.399),(.12,.153,.041),'fffaf1')
        ball((side*.184,-.002,.432),(.092,.13,.031),'302522',True)
        ball((side*.184-.029,.055,.46),(.028,.036,.012),'ffffff',True)
        ball((side*.184+.026,-.061,.459),(.012,.014,.008),'cfb49d')
        ball((side*.338,-.143,.358),(.07,.034,.02),'edaa91')
        stroke([(side*.11,.215,.371),(side*.20,.236,.38),(side*.28,.209,.369)],.024,hair)
    ball((0,-.098,.441),(.047,.039,.04),'ec946a')
    stroke([(-.078,-.202,.399),(0,-.231,.413),(.078,-.202,.399)],.012,'a85d41')
    # Back and crown leave the entire face readable from the oblique game camera.
    ball((0,.17,-.16),(.53,.40,.36),hair)
    if v in [1,5]:
        for side in [-1,1]:
            lock([(side*.34,.34,.0),(side*.53,.03,.12),(side*.43,-.37,.05)],.16,.15,hair)
    if v in [3,6]:
        for n in range(9):
            angle=n*math.pi/8
            ball((math.cos(angle)*.44,.23+math.sin(angle)*.27,.08+math.sin(angle)*.14),(.17,.18,.16),hair)
        for n in [-1,0,1]: ball((n*.25,.49,-.16),(.21,.18,.20),hair)
    else:
        # Different lengths and curved sweeps make the fringe read as a hairstyle.
        fringe=[(-.34,.27,.145),(-.14,.12,.17),(.08,.21,.17),(.28,.29,.14)]
        for x,tip,width in fringe:
            if v in [4,5]:
                lock([(x+.08,.28,.29),(x+.10,.24,.39),(x-.05,min(tip,.16),.405)],width*.8,.06,hair)
            else:
                lock([(x+.12,.46,.06),(x+.15,.40,.40),(x-.08,tip,.405)],width,.095,hair)
    if v==0:
        lock([(.03,.48,-.08),(.19,.69,.06),(.08,.56,.13)],.10,.08,hair)
    if v==1: glasses('238f89')
    if v==2: glasses('554940',True)
    if v==3: glasses('b99652')
    if v==4:
        ball((0,.44,-.01),(.56,.21,.43),'756345')
        box((0,.322,.31),(.90,.075,.43),'6a583e',.035)
        for side in [-1,1]:
            lock([(side*.015,-.15,.455),(side*.105,-.21,.48),(side*.18,-.15,.406)],.06,.033,hair)
    if v==5:
        ball((0,.47,-.04),(.55,.27,.44),'d66d36')
        box((0,.32,.02),(1.07,.15,.79),'d66d36',.065)
        ball((.14,.72,-.12),(.13,.14,.13),'c85e2e')
        for side in [-1,1]:
            for j in range(4): ball((side*(.46+.015*(j%2)),-.20-j*.115,.02),(.095,.105,.095),hair)
            box((side*.47,-.55,.025),(.17,.055,.17),'f4d8a4',.025)
    if v==7:
        for side in [-1,1]:
            ball((side*.49,.34,-.10),(.23,.24,.23),hair)
            ball((side*.41,.24,.05),(.11,.055,.11),shirt)
    part('body')
    # Bottom at .56 in world coordinates matches the existing seat contact contract.
    cushion((0,.28,0),(.35,.44,.24),shirt,.8)
    box((0,-.075,0),(.64,.12,.43),pants,.055)
    box((0,.56,0),(.28,.12,.30),skin,.05)
    if v in [1,2,4,5,6]:
        box((0,.31,.249),(.27,.60,.035),'fff0d6',.015)
        for side in [-1,1]:
            box((side*.21,.30,.235),(.17,.58,.065),shirt,.04)
            stroke([(side*.10,.55,.277),(side*.14,.37,.28),(side*.13,.03,.274)],.012,shirt)
        for y in [.38,.22,.06]: ball((.098,y,.283),(.025,.025,.013),'e8d5ad')
    if v==0:
        box((0,-.04,.02),(.66,.10,.43),'d79d32',.038)
        for x in [-.10,-.05,0,.05,.10]: stroke([(x,.49,.22),(x,.57,.20)],.008,'d79d32')
    if v==2:
        lock([(0,.53,.265),(0,.32,.28),(0,.10,.267)],.048,.018,'a84e4f')
        for side in [-1,1]: lock([(side*.17,.57,.26),(side*.12,.43,.29),(side*.21,.28,.275)],.055,.015,shirt)
    if v==3:
        box((0,-.10,.015),(.73,.23,.47),pants,.085)
        for y in [.42,.25,.08]: ball((0,y,.251),(.029,.029,.015),'d5a1b9')
    if v==4:
        for x in [-.21,-.12,.12,.21]:
            stroke([(x,.40,.276),(x+.025,.31,.281),(x,.22,.281),(x+.025,.13,.281)],.009,'d7b782')
    if v==5:
        for side in [-1,1]:
            for y in [.11,.25,.39]: stroke([(side*.13,y,.278),(side*.27,y,.27)],.009,'357873')
    if v==7:
        ball((0,.56,-.045),(.32,.16,.27),shirt)
        box((0,.14,.258),(.36,.18,.045),'a46dc3',.06)
        for side in [-1,1]: stroke([(side*.12,.53,.25),(side*.10,.35,.29)],.014,'fff0d6')
    for side,label in [(-1,'L'),(1,'R')]:
        part('arm'+label)
        ball((0,-.09,0),(.145,.21,.15),'fff0d6' if v in [4,5] else shirt)
        part('hand'+label)
        ball((0,-.08,0),(.097,.14,.101),skin)
        ball((0,-.225,.01),(.124,.132,.115),skin)
        ball((-side*.09,-.20,.067),(.052,.075,.054),skin)
        part('leg'+label)
        box((0,-.13,0),(.26,.34,.28),pants,.085)
        part('shoe'+label)
        box((0,-.12,0),(.205,.26,.22),skin if v in [0,3,6,7] else pants,.065)
        box((0,-.295,.065),(.32,.11,.45),'f6e6cc',.045)
        box((0,-.225,.055),(.30,.13,.40),shoes,.06)
        box((0,-.164,.14),(.18,.025,.12),'fff1dc',.012)
    root=bpy.data.objects.new(f'guest_{v}',None);bpy.context.collection.objects.link(root);roots.append(root)
    for key,objects in list(PARTS.items()):
        if not key.startswith(f'guest_{v}_'): continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        o=bpy.context.object;o.name=key
        bpy.context.scene.cursor.location=(0,0,0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR');o.parent=root
        # Remove duplicate material slots, preserving the authored surfaces.
        o.data.update()

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'guests-blender-v1.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
counts={}
for root in roots:
    count=0
    for o in root.children:
        o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
    counts[root.name]=count
# Arrange the editable .blend in a standing lineup with the same runtime pivots.
pivots={'head':(0,1.67,0),'body':(0,.72,0),'armL':(-.33,1.20,0),'armR':(.33,1.20,0),'handL':(-.33,.93,0),'handR':(.33,.93,0),'legL':(-.17,.65,0),'legR':(.17,.65,0),'shoeL':(-.17,.36,0),'shoeR':(.17,.36,0)}
for i,root in enumerate(roots):
    root.location=xyz(((i%4)*1.7,0,-(i//4)*2))
    for o in root.children:o.location=xyz(pivots[o.name.split('_',2)[2]])
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'guests-blender-v1.blend'))
(OUT/'guests-blender-v1.provenance.json').write_text(json.dumps({'source':'Local Blender geometry authored for OnTop; user supplied eight guest character references','generator':'frontend/scripts/skewer/build-guests.py','blender':bpy.app.version_string,'triangles':counts,'rig':'10 rigid parts per guest; existing ToyActor joints and seat contact','paid_generation':False},ensure_ascii=False,indent=2),encoding='utf-8')
print('GUEST_EXPORT',json.dumps(counts))
