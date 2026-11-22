"""Blender background: normalize approved source models into a verified local package.

Usage: blender -b --python scripts/prepare-christmas-assets.py -- SOURCE_ROOT OUTPUT
Sources remain unchanged. No provider/network calls are made.
"""
import bpy, bmesh, os, sys, math, json, hashlib
from mathutils import Vector
source_root,output=sys.argv[sys.argv.index('--')+1:]
os.makedirs(output,exist_ok=True)
specs=[
 ('tree','plaza-christmas-wire-star-20261122/tree/Christmas_Tree_12m_VolumetricWireStar_Unlit.glb',12,0,None),
 ('santa','plaza-christmas-tripo-20261122/revisions/final-assets/Santa_Bell_Sack.glb',2.8,-math.pi/2,'8073118c-7bf3-46e7-98df-eb38caeacb5f'),
 ('snowman','plaza-christmas-tripo-20261122/tripo-out/plaza-snowman-020ec369/model.glb',3.1,-math.pi/2,'020ec369-1b36-44b0-a777-bd217d1e848c'),
 ('rudolph','plaza-christmas-natural-20261122/final-assets/Rudolph_ChestHarness_Run.glb',2.4,-math.pi/2,'d415dcbd-4e13-4e77-9958-16e1be2396bc'),
 ('sleigh','plaza-christmas-tripo-20261122/tripo-out/plaza-sleigh-d370b998/model.glb',None,-math.pi/2,'d370b998-7ee9-447d-a145-c96dfb8aeae5'),
]
def digest(file):
 with open(file,'rb') as f:return hashlib.sha256(f.read()).hexdigest()
def points(objects):return [obj.matrix_world@v.co for obj in objects for v in obj.data.vertices]
def bounds(vertices):return [[min(p[i] for p in vertices),max(p[i] for p in vertices)] for i in range(3)]
def collision_hull(vertices):
 bm=bmesh.new()
 for p in vertices:bm.verts.new((p.x,p.z,-p.y))
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.001)
 result=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
 hull_faces=[g for g in result['geom'] if isinstance(g,bmesh.types.BMFace)]
 hull_vertices={v for face in hull_faces for v in face.verts}
 coords=sorted(tuple(round(value,5) for value in v.co) for v in hull_vertices)
 bm.free();return [value for p in coords for value in p]
manifest={'version':1,'package':'ontop-christmas-approved-assets','origin_dev':'3c8240eaf92a493edfea3e69e2aae665c8e32896',
 'provider_calls':0,'additional_credits':0,'license':{'tripo':'LicenseRef-Tripo-API-Output','terms':'https://developers.tripo3d.ai/en/terms','section':'3.2 Outputs & Service Restrictions',
 'local_geometry':'User-commissioned original procedural geometry; reference photos were not copied as textures.'},'assets':[]}
collisions={}
for name,relative,target_height,yaw,task in specs:
 source=os.path.join(source_root,relative);before=digest(source)
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=60
 bpy.ops.import_scene.gltf(filepath=source)
 for obj in list(bpy.context.scene.objects):
  if obj.name=='Icosphere':bpy.data.objects.remove(obj,do_unlink=True)
 meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
 original_triangles=sum(len(face.vertices)-2 for obj in meshes for face in obj.data.polygons)
 if name=='tree':
  foliage=bpy.data.objects['Fir_Foliage']
  bpy.context.view_layer.objects.active=foliage
  weld=foliage.modifiers.new('Weld duplicate needle vertices','WELD');weld.merge_threshold=.00001
  bpy.ops.object.modifier_apply(modifier=weld.name)
  decimate=foliage.modifiers.new('Retain the approved silhouette at lower cost','DECIMATE');decimate.ratio=.52;decimate.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=decimate.name)
 source_bounds=bounds(points(meshes));scale=target_height/(source_bounds[2][1]-source_bounds[2][0]) if target_height else 2.8/(source_bounds[0][1]-source_bounds[0][0])
 roots=[obj for obj in bpy.context.scene.objects if obj.parent is None]
 root=bpy.data.objects.new('Christmas_'+name,None);bpy.context.scene.collection.objects.link(root)
 for obj in roots:obj.parent=root
 root.rotation_euler.z=yaw;root.scale=(scale,scale,scale)
 bpy.context.view_layer.update();p=points(meshes);box=bounds(p)
 if name!='tree':root.location.x=-(box[0][0]+box[0][1])/2;root.location.y=-(box[1][0]+box[1][1])/2
 root.location.z=-box[2][0]+(-.9 if name in ('rudolph','sleigh') else 0)
 bpy.context.view_layer.update();p=points(meshes);box=bounds(p)
 root['approved_asset']=name
 if name in ('tree','santa','snowman'):collisions[name]={'vertices':collision_hull(p),'radius':max(math.hypot(v.x,v.y) for v in p),'height':box[2][1]-box[2][0]}
 if name=='rudolph':
  rig=next(obj for obj in bpy.context.scene.objects if obj.type=='ARMATURE')
  action=rig.animation_data.action
  if action is None:action=next(s.action for t in rig.animation_data.nla_tracks for s in t.strips)
  rig.animation_data_clear();rig.animation_data_create();rig.animation_data.action=action
  rig.animation_data.action_slot=action.slots[0]
  bpy.context.scene.frame_start=0;bpy.context.scene.frame_end=48
 for mat in bpy.data.materials:
  if mat.name in ('MAT_Star_Emission','MAT_StringBulb_Emission'):
   mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=0
 destination=os.path.join(output,name+'.glb')
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.gltf(filepath=destination,export_format='GLB',export_extras=True,
  export_animations=name=='rudolph',export_frame_range=True,export_force_sampling=True,
  export_meshopt_compression_enable=True,export_image_quality=85)
 assert digest(source)==before,'Source changed'
 manifest['assets'].append({'id':name,'file':name+'.glb','source':relative,'source_sha256':before,'provider_task':task,
  'sha256':digest(destination),'bytes':os.path.getsize(destination),'source_triangles':original_triangles,
  'triangles':sum(len(face.vertices)-2 for obj in meshes for face in obj.data.polygons),
  'dimensions_metres':[box[i][1]-box[i][0] for i in (0,2,1)],'front_axis':'+Z','ground_offset':-.9 if name in ('rudolph','sleigh') else 0})
 print('PREPARED_ASSET',json.dumps(manifest['assets'][-1]))
with open(os.path.join(output,'collision.json'),'w') as f:json.dump(collisions,f,separators=(',',':'))
manifest['collision_sha256']=digest(os.path.join(output,'collision.json'))
with open(os.path.join(output,'manifest.json'),'w') as f:json.dump(manifest,f,indent=2)
print('APPROVED_ASSET_PACKAGE_COMPLETE',output)
