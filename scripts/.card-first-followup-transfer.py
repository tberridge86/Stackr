# One-shot source transfer for PR187; removed before the final candidate is reviewed.
from pathlib import Path
import hashlib
import os
import subprocess
assert os.environ.get('GITHUB_REPOSITORY') == 'tberridge86/Stackr'
assert os.environ.get('GITHUB_REF') == 'refs/heads/agent/release/card-first-browse-ui'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA']
assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
outputs = {}
def edit(name, before, after, replacements):
    data = Path(name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == before, 'Source drift: ' + name
    text = data.decode('utf-8')
    for old, new in replacements:
        assert text.count(old) == 1, (name, old)
        text = text.replace(old, new)
    assert hashlib.sha256(text.encode()).hexdigest() == after, 'Output mismatch: ' + name
    outputs[name] = text
edit('app/set/[id].tsx', 'fba47fad1e502c63646572943d2f1b68b0970410f38b899aa3391d20c6747d84', 'fe67c04d7bf0bf1ac2552ec7718ae3cdb550b771ef5728b7ee442cab9427110e', [
 ("type FinishSectionKey = 'pattern' | 'texture' | 'masterBall' | 'stamped';", "type FinishSectionKey = 'pattern' | 'texture' | 'masterBall' | 'stamped';\ntype FinishSectionFilter = FinishSectionKey | 'all';"),
 ("useState<FinishSectionKey>('pattern')", "useState<FinishSectionFilter>('all')"),
 ("    setFinishSection('pattern');", "    setFinishSection('all');"),
 ("  useEffect(() => {\n    setSetLogoFailed(false);\n  }, [setId]);", "  useEffect(() => {\n    setSetLogoFailed(false);\n    clearCardFilters();\n    setBrowseFiltersVisible(false);\n  }, [setId, clearCardFilters]);"),
 ("    if (!hasCompletionistSections) return;\n    if (!availableFinishSections.some((section) => section.key === finishSection)) {\n      setFinishSection(availableFinishSections[0].key);\n    }", "    if (finishSection !== 'all' && (!hasCompletionistSections ||\n      !availableFinishSections.some((section) => section.key === finishSection))) {\n      setFinishSection('all');\n    }"),
 ("const matchesFinishSection = !hasCompletionistSections || getFinishSectionKey(card, completionistFamilyCounts) === finishSection;", "const matchesFinishSection = finishSection === 'all' || !hasCompletionistSections || getFinishSectionKey(card, completionistFamilyCounts) === finishSection;"),
 ("  const activeFinishSection = hasCompletionistSections\n    ? availableFinishSections.find((section) => section.key === finishSection) ?? availableFinishSections[0]\n    : null;", "  const activeFinishSection = hasCompletionistSections && finishSection !== 'all'\n    ? availableFinishSections.find((section) => section.key === finishSection) ?? null\n    : null;"),
 ("Number(selectedRarity !== ALL_RARITY_FILTER) + Number(hasCompletionistSections) + Number(sort !== 'number')", "Number(selectedRarity !== ALL_RARITY_FILTER) + Number(activeFinishSection !== null) + Number(sort !== 'number')"),
 ("            <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>\n              {[activeFinishSection?.shortLabel, activeRarityFilter?.label].filter(Boolean).join(' · ')}\n            </Text>", "            {activeFinishSection || activeRarityFilter ? (\n              <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>\n                {[activeFinishSection?.shortLabel, activeRarityFilter?.label].filter(Boolean).join(' · ')}\n              </Text>\n            ) : null}"),
 ("choices={availableFinishSections.map((section) => ({ key: section.key, label: section.label, count: section.count }))}", "choices={[{ key: 'all', label: 'All finishes', count: cards.length }, ...availableFinishSections.map((section) => ({ key: section.key, label: section.label, count: section.count }))]}"),
 ("onSelect={(key) => setFinishSection(key as FinishSectionKey)}", "onSelect={(key) => setFinishSection(key as FinishSectionFilter)}"),
])
edit('components/StackrBrowseControls.tsx', '17021b96f9ee20578e9b0237e393696d84461a58b6c1a27e646cfc4c2c898ea4', '2faa3b50a3d9d66188e40de5edd86a88f680bbbf088f5102dca766b266f23c35', [
 ("import {\n  Keyboard,", "import {\n  ActivityIndicator,\n  Keyboard,"),
 ("  onSearchChange,\n  placeholder = 'Search cards…',", "  onSearchChange,\n  onSubmitSearch,\n  loading = false,\n  placeholder = 'Search cards…',"),
 ("  onSearchChange: (value: string) => void;\n  placeholder?: string;", "  onSearchChange: (value: string) => void;\n  onSubmitSearch?: () => void;\n  loading?: boolean;\n  placeholder?: string;"),
 ('<View testID="browse-toolbar" style=', '<View testID="browse-toolbar" accessibilityState={{ busy: loading }} style='),
 ("            autoCorrect={false}\n            autoCapitalize=", "            autoCorrect={false}\n            spellCheck={false}\n            autoCapitalize="),
 ("            onSubmitEditing={() => Keyboard.dismiss()}", "            onSubmitEditing={() => { Keyboard.dismiss(); onSubmitSearch?.(); }}"),
 ("          {search.length > 0 ? (", '          {loading ? <ActivityIndicator size="small" color={theme.colors.primary} accessibilityLabel="Searching" /> : null}\n          {search.length > 0 ? ('),
])
edit('app/(tabs)/search.tsx', '1c63777d273ee859bc10854d8ae1384df1675b206acb27a97760772defb5f24c', 'c05ad1038c63d4e670767d907e661991fff62193e2ed3337d61d95acba8c19d5', [
 ('                placeholder="Search cards, sets and products"', "                onSubmitSearch={() => { void rememberSearch(); }}\n                loading={loading}\n                placeholder={showcaseConfig?.placeholder ?? 'Search cards, sets or sealed products'}"),
])
for name, text in outputs.items():
    Path(name).write_bytes(text.encode())
subprocess.run(['git', 'add', '--', *outputs], check=True)
changed = set(subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z']).decode().strip('\0').split('\0'))
assert changed == set(outputs)
subprocess.run(['git', 'diff', '--cached', '--check'], check=True)
subprocess.run(['git', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', 'Default set browsing to all finishes and retain Search submission and loading behaviour'], check=True)
print('Source candidate:', subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip())
