#!/usr/bin/env python3
from pathlib import Path

import official_candidate_audit as audit

# These pages are product-release pages with packaging imagery. They are better
# evidence than the gameplay/article pages used in the first broad audit.
audit.OUT = audit.ROOT / 'official-candidate-audit-extra'
audit.IMG = audit.OUT / 'images'
audit.ARTICLES = {
    '19640': (
        'Battle Party Gongmeng and Yaomeng sale page',
        'https://www.pokemon.cn/tcg/product/19640.html',
        'csve1c,csve1pc,csve2c,csve2pc',
    ),
    '16365': (
        'Lillie support gift box launch page',
        'https://www.pokemon.cn/tcg/product/16365.html',
        'csmlc',
    ),
    '16348': (
        'Eevee GX gift box launch page',
        'https://www.pokemon.cn/tcg/product/16348.html',
        'csmyc',
    ),
    '16342': (
        'Eevee GX gift box release page',
        'https://www.pokemon.cn/tcg/product/16342.html',
        'csmyc',
    ),
    '15951': (
        'Battle Party combination sale page',
        'https://www.pokemon.cn/tcg/product/15951.html',
        'csmpac,csmpbc,csmpcc,csmpdc,csmpec,csmpfc,csmpgc,csmphc,csmpic',
    ),
}

if __name__ == '__main__':
    raise SystemExit(audit.main())
