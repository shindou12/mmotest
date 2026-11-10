import sys
from PIL import Image, ImageFilter, ImageDraw, ImageFont
import numpy as np
out=sys.argv[1]; font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',20); cw=620; cells=[]
for a in sys.argv[2:]:
    lab,rest=a.split('=',1); p,box=rest.rsplit(':',1); x0,y0,x1,y1=[float(v) for v in box.split(',')]
    im=Image.open(p).convert('RGB'); w,h=im.size; c=im.crop((int(x0*w),int(y0*h),int(x1*w),int(y1*h))); c=c.resize((cw,int(c.height*cw/c.width)),Image.LANCZOS)
    g=np.asarray(c.convert('L').filter(ImageFilter.GaussianBlur(9)),dtype=float)/255
    q=np.where(g<0.33,40,np.where(g<0.58,128,225)).astype('uint8')
    fr=[(q==v).mean() for v in (40,128,225)]
    cells.append((lab+'  暗%d 中%d 明%d'%tuple(round(f*100) for f in fr),c,Image.fromarray(q).convert('RGB')))
H=sum(c[1].height*2+34 for c in cells[:1])
rows=[cells[i:i+3] for i in range(0,len(cells),3)]
S=Image.new('RGB',(3*(cw+6)+6,sum(max(c[1].height for c in r)*2+36 for r in rows)+6),(24,24,24)); d=ImageDraw.Draw(S); y=6
for r in rows:
    x=6; mh=max(c[1].height for c in r)
    for lab,c,q in r: d.text((x+2,y),lab,fill=(240,240,240),font=font); S.paste(c,(x,y+28)); S.paste(q,(x,y+30+mh)); x+=cw+6
    y+=mh*2+36
S.save(out,quality=88); print(out,S.size)
