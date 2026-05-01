from PIL import Image
import os

degrees = 20

names = [
    'mewtwo', 'lucario', 'charizard', 'gardevoir', 'gengar',
    'arceus', 'lucario_dark', 'rayquaza', 'kyogre', 'ho_oh',
    'mew', 'eevee', 'leafeon', 'darkrai', 'sylveon',
    'snorlax', 'charizard_dark', 'lugia', 'volcarona', 'jolteon',
    'lugia_blue', 'sudowoodo', 'suicune', 'celebi', 'blaziken',
    'vaporeon', 'zoroark', 'blissey', 'arcanine', 'umbreon',
    'jirachi', 'darkrai_black', 'blastoise', 'tyranitar', 'espeon',
    'typhlosion', 'skarmory', 'garchomp', 'mismagius', 'zapdos',
]

for name in names:
    path = f'assets/binders/{name}.png'
    if os.path.exists(path):
        img = Image.open(path)
        rotated = img.rotate(degrees, resample=Image.BICUBIC, expand=False)
        rotated.save(path)
        print(f'✅ Rotated {name}.png')
    else:
        print(f'⚠️ Skipped {name}.png - not found')

print(f'\n🎉 Done! All binders rotated {degrees} degrees.')