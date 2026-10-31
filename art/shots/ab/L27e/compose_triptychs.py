from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
FONT = ImageFont.truetype(r'C:\Windows\Fonts\meiryo.ttc', 18)
TITLE_FONT = ImageFont.truetype(r'C:\Windows\Fonts\meiryo.ttc', 22)
PANEL_W = 532
GAP = 8
MARGIN = 10


def crop_reference(name):
    image = Image.open(ROOT / 'art' / 'ref' / f'{name}.webp').convert('RGB')
    width, height = 1532, 869
    left = (image.width - width) // 2
    return image.crop((left, 0, left + width, height))


def crop_range(image, box):
    x0, y0, x1, y1 = box
    w, h = image.size
    return image.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))


def rows(trial):
    full_boxes = None
    b01_ref = crop_reference('B01')
    b03_ref = crop_reference('B03')
    b01 = Image.open(OUT / 'base' / 'B01.png').convert('RGB')
    b03 = Image.open(OUT / 'base' / 'B03.png').convert('RGB')
    b01_trial = Image.open(OUT / trial / 'B01.png').convert('RGB')
    b03_trial = Image.open(OUT / trial / 'B03.png').convert('RGB')
    return [
        ('B01・全体', b01_ref, b01, b01_trial, None),
        ('B01・拡大（横 0.30〜0.62／縦 0.15〜0.55）',
         crop_range(b01_ref, (0.30, 0.15, 0.62, 0.55)),
         crop_range(b01, (0.30, 0.15, 0.62, 0.55)),
         crop_range(b01_trial, (0.30, 0.15, 0.62, 0.55)), None),
        ('B03・全体', b03_ref, b03, b03_trial, None),
        ('B03・拡大（横 0.05〜0.40／縦 0.10〜0.50）',
         crop_range(b03_ref, (0.05, 0.10, 0.40, 0.50)),
         crop_range(b03, (0.05, 0.10, 0.40, 0.50)),
         crop_range(b03_trial, (0.05, 0.10, 0.40, 0.50)), None),
    ]


def make(trial, label, output):
    row_data = rows(trial)
    prepared = []
    for title, *images, _ in row_data:
        panel_h = round(PANEL_W * images[0].height / images[0].width)
        prepared.append((title, [im.resize((PANEL_W, panel_h), Image.Resampling.LANCZOS) for im in images], panel_h))
    width = MARGIN * 2 + PANEL_W * 3 + GAP * 2
    height = 68 + sum(24 + panel_h + GAP for _, _, panel_h in prepared) - GAP
    sheet = Image.new('RGB', (width, height), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    draw.text((MARGIN, 5), f'L27 仮説 E | 葉のビルボード試作 | {label}', font=TITLE_FONT, fill=(205, 205, 205))
    headers = ('見本', '現在（base）', f'試作（{label}）')
    for i, text in enumerate(headers):
        draw.text((MARGIN + i * (PANEL_W + GAP), 40), text, font=FONT, fill=(185, 185, 185))
    y = 68
    for title, images, panel_h in prepared:
        draw.rectangle((0, y, width, y + 23), fill=(32, 32, 32))
        draw.text((MARGIN, y + 2), title, font=FONT, fill=(190, 190, 190))
        y += 24
        for i, image in enumerate(images):
            sheet.paste(image, (MARGIN + i * (PANEL_W + GAP), y))
        y += panel_h + GAP
    sheet.save(OUT / output, 'WEBP', quality=92, method=6)
    print(f'{OUT / output} {sheet.size}')


make('prelit5', 'prelit 0.5', 'triptych_prelit5.webp')
make('prelit10', 'prelit 1.0', 'triptych_prelit10.webp')
make('bb', 'clover_bb', 'triptych_bb.webp')
