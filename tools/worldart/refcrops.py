import sys
from PIL import Image, ImageDraw, ImageFont
# crops.py out.jpg cellw label=path:x0,y0,x1,y1(fractions) ...
out,cw=sys.argv[1],int(sys.argv[2]); font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',20)
cells=[]
for a in sys.argv[3:]:
    lab,rest=a.split('=',1); p,box=rest.rsplit(':',1); x0,y0,x1,y1=[float(v) for v in box.split(',')]
    im=Image.open(p).convert('RGB'); w,h=im.size; c=im.crop((int(x0*w),int(y0*h),int(x1*w),int(y1*h)))
    cells.append((lab,c.resize((cw,int(c.height*cw/c.width)),Image.LANCZOS)))
cols=3; rows=[cells[i:i+cols] for i in range(0,len(cells),cols)]
H=sum(max(c[1].height for c in r)+30 for r in rows)
S=Image.new('RGB',(cols*(cw+6)+6,H+6),(24,24,24)); d=ImageDraw.Draw(S); y=6
for r in rows:
    x=6
    for lab,im in r: d.text((x+2,y),lab,fill=(240,240,240),font=font); S.paste(im,(x,y+28)); x+=cw+6
    y+=max(c[1].height for c in r)+30
S.save(out,quality=88); print(out,S.size)
