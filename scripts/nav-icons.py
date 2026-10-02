"""Icônes de la barre d'onglets et quelques illustrations, dérivées des sprites HD de la session sprites (out_hd/), sans les modifier.

Usage : python3 scripts/nav-icons.py <chemin vers out_hd>
Écrit public/sprites/nav/{accueil,jardin,taches,savoirs,profil}.png et public/sprites/art/*.png (404, assistant). Provisoire : à remplacer par des icônes dédiées
quand la session sprites les livrera.
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else 'out_hd')
DEST = Path('public/sprites/nav')
DEST.mkdir(parents=True, exist_ok=True)


def square(im: Image.Image) -> Image.Image:
    """Recadre sur les pixels opaques puis centre dans un carré transparent."""
    im = im.crop(im.getbbox())
    side = max(im.size)
    out = Image.new('RGBA', (side, side))
    out.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return out


def load(rel: str) -> Image.Image:
    return Image.open(SRC / rel).convert('RGBA')


square(load('structures/cabane-outils.png')).save(DEST / 'accueil.png')
square(load('ui/competence-potager.png')).save(DEST / 'jardin.png')
square(load('ui/calendrier.png')).save(DEST / 'taches.png')
# Le livre du badge « premier guide », sans son cadre en bois.
square(load('badges/premier-guide.png').crop((9, 10, 56, 52))).save(DEST / 'savoirs.png')

# Jardinier de face (calques d'avatar en niveaux de gris, teintés par multiplication comme dans la vue jardin),
# recadré tête et buste.
LAYERS = [
    ('corps-base', (236, 180, 140)), ('yeux-base', None), ('bas-pantalon', (90, 110, 150)),
    ('haut-tshirt', (250, 240, 220)), ('tablier-jardinier', (110, 150, 80)), ('cheveux-court', (120, 75, 45)),
    ('couvre-chef-chapeau-paille', (240, 200, 120)),
]
avatar = Image.new('RGBA', (64, 96))
for name, tint in LAYERS:
    layer = load(f'avatar/{name}-bas-arret.png')
    if tint:
        rgb = ImageChops.multiply(layer.convert('RGB'), Image.new('RGB', layer.size, tint))
        rgb.putalpha(layer.getchannel('A'))
        layer = rgb
    avatar.alpha_composite(layer)
square(avatar.crop((6, 7, 58, 62))).save(DEST / 'profil.png')

ART = Path('public/sprites/art')
ART.mkdir(parents=True, exist_ok=True)
for name in ['epouvantail', 'tracteur', 'table-chaises']:
    square(load(f'deco/{name}.png')).save(ART / f'{name}.png')
print('icônes écrites dans', DEST, 'et', ART)
