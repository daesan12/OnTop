import json, struct, sys, numpy as np
f = sys.argv[sys.argv.index('--') + 1]
b = open(f, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); bin_ = b[28 + n:]
def acc(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
    k = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.frombuffer(bin_, dt, a['count'] * k, v.get('byteOffset', 0)).reshape(a['count'], k)
for m in j['meshes']:
    p = m['primitives'][0]; P = acc(p['attributes']['POSITION']); I = acc(p['indices']).ravel()
    print(m['name'])
    for name, s, c in m['extras']['pieces']:
        y = P[I[s:s + c], 1]
        if c > 300 or 'item' in name: print('  %-50s tris %6d  y %.3f..%.3f' % (name, c // 3, y.min(), y.max()))
