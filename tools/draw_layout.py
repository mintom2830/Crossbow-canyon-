import json, sys
from PIL import Image, ImageDraw
d = json.load(open(sys.argv[1])); S = 7; ox, oz = 40, 54
img = Image.new("RGB", (80*S, 100*S), (232,182,90)); g = ImageDraw.Draw(img)
P = lambda x, z: ((x+ox)*S, (z+oz)*S)
w = d['walk']; g.rectangle([P(w['minX'], w['minZ']), P(w['maxX'], w['maxZ'])], outline=(120,60,40), width=2)
for pl in d['plateaus']: g.polygon([P(*p) for p in pl], fill=(214,160,70), outline=(170,80,50))
r = d['road']; hw = d['half']*S
for i in range(len(r)-1): g.line([P(*r[i]), P(*r[i+1])], fill=(242,222,176), width=int(hw*2))
for s in d['slots']:
  x, z = P(s['x'], s['z']); g.rectangle([x-7, z-7, x+7, z+7], fill=(90,60,40)); g.text((x+9, z-6), s['id'], fill=(0,0,0))
  rr = 9.5*S; g.ellipse([x-rr, z-rr, x+rr, z+rr], outline=(60,100,200))
f = d['fortress']; x, z = P(f['x'], f['z']); rr = f['radius']*S; g.ellipse([x-rr, z-rr, x+rr, z+rr], fill=(120,80,50))
x, z = P(d['fpad']['x'], d['fpad']['z']); g.rectangle([x-7, z-7, x+7, z+7], fill=(40,40,200))
img.save(sys.argv[2])
