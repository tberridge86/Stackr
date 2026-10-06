/* Local component contracts: no account, network requests, or remote writes. */
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

async function main() {
  const result = await esbuild.build({
    stdin: {
      contents: `export * from './lib/typography'; export * from './lib/theme';
        export * from './components/StackrTextInput'; export * from './components/StackrRatingInput';
        export * from './components/StackrModalSystem'; export * from './components/StackrStates';
        export * from './components/StackrControls';`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/jsx-runtime', 'react-native-web'],
    loader: { '.png': 'dataurl' },
    plugins: [{ name: 'local-platform-adapters', setup(build) {
      build.onResolve({ filter: /^react-native$/ }, () => ({ path: 'rn', namespace: 'adapter' }));
      build.onResolve({ filter: /^@expo\/vector-icons$/ }, () => ({ path: 'icons', namespace: 'adapter' }));
      build.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: 'insets', namespace: 'adapter' }));
      build.onLoad({ filter: /.*/, namespace: 'adapter' }, ({ path: name }) => ({
        resolveDir: process.cwd(),
        contents: name === 'rn' ? `
          const React = require('react'); const rn = require('react-native-web');
          module.exports = {...rn,
            Pressable: React.forwardRef((props, ref) => {
              globalThis.__stackrControls.push(props);
              return React.createElement(rn.Pressable, {...props, ref});
            }),
            Modal: props => {
              globalThis.__stackrModals.push(props);
              return props.visible ? React.createElement(rn.View, null, props.children) : null;
            }
          };` : name === 'icons' ? `
          const React = require('react');
          exports.Ionicons = () => React.createElement('span', {'aria-hidden': true});
          exports.Ionicons.glyphMap = {};` : `exports.useSafeAreaInsets = () => ({top:0,bottom:0,left:0,right:0});`,
      }));
    } }],
  });
  const filename = path.join(process.cwd(), 'scripts/ui-contract-bundle.cjs');
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, compiled.filename);
  const ui = compiled.exports;
  const render = (component, props) => {
    globalThis.__stackrControls = [];
    globalThis.__stackrModals = [];
    return renderToStaticMarkup(React.createElement(component, props));
  };

  assert.equal(ui.resolveTypographyStyle({fontSize: 38, fontWeight: '900'}).fontFamily, ui.stackrFonts.extraBold);
  assert.ok(ui.resolveTypographyStyle({fontSize: 38}).lineHeight >= 38, 'Large overrides must not inherit a 21px line box.');
  assert.equal(ui.resolveTypographyStyle({fontSize: 28, lineHeight: 40}).lineHeight, 40);
  assert.equal(ui.resolveTypographyStyle(undefined, 'pageTitle').lineHeight, 32);
  assert.equal(ui.resolveTypographyStyle(undefined, undefined, true).fontWeight, '700');
  assert.equal(ui.resolveTypographyStyle({fontFamily: 'Custom'}).fontFamily, 'Custom');

  const input = render(ui.StackrTextInput, {label: 'Collector name', required: true, helpText: 'Public name', error: 'Enter a name', value: '', onChangeText() {}});
  assert.match(input, /aria-label="Collector name, required"/);
  assert.match(input, /aria-required="true"/);
  assert.match(input, /aria-invalid="true"/);
  const descriptions = input.match(/aria-describedby="([^"]+)"/)[1].split(' ');
  assert.equal(descriptions.length, 2);
  for (const id of descriptions) assert.ok(input.includes(`id="${id}"`), 'Every field description must identify rendered help/error text.');
  assert.match(input, /role="alert"/);

  const changes = [];
  const radios = render(ui.StackrRatingInput, {value: 3, onChange: n => changes.push(n)});
  assert.equal((radios.match(/role="radio"/g) || []).length, 5);
  assert.match(radios.match(/<div[^>]*aria-label="3 of 5 stars"[^>]*>/)[0], /aria-checked="true"/);
  assert.equal((radios.match(/tabindex="0"/g) || []).length, 1);
  let prevented = 0;
  globalThis.__stackrControls[4].onKeyDown({key:'ArrowRight', preventDefault(){prevented++;}});
  globalThis.__stackrControls[0].onKeyDown({key:'End', preventDefault(){prevented++;}});
  assert.deepEqual(changes, [1, 5]);

  const busyButton = render(ui.StackrButton, {label:'Submit review', loading:true, onPress(){}});
  assert.match(busyButton, /aria-busy="true"/);
  assert.match(busyButton, /aria-disabled="true"/);
  const selectedChip = render(ui.StackrChip, {label:'Near mint', selected:true, onPress(){}});
  assert.match(selectedChip, /aria-pressed="true"/);
  assert.equal(prevented, 2);
  render(ui.StackrRatingInput, {value: 3, disabled: true, onChange: n => changes.push(n)});
  globalThis.__stackrControls[2].onKeyDown({key:'Home', preventDefault(){throw new Error('Disabled rating must ignore navigation');}});
  assert.deepEqual(changes, [1, 5]);

  let closes = 0;
  for (const component of [ui.StackrBottomSheet, ui.StackrCenterModal]) {
    const before = closes;
    render(component, {visible:true, title:'Filter cards', accessibilityLabel:'Filter cards', dismissible:false, onClose(){closes++;}, children:React.createElement('span', null, 'Contents')});
    assert.equal(globalThis.__stackrModals[0].accessibilityLabel, 'Filter cards');
    globalThis.__stackrModals[0].onRequestClose();
    assert.equal(closes, before);
    render(component, {visible:true, accessibilityLabel:'Filter cards', dismissible:true, onClose(){closes++;}, children:React.createElement('span', null, 'Contents')});
    globalThis.__stackrModals[0].onRequestClose();
  }
  assert.equal(closes, 2);
  const recovery = render(ui.StackrErrorState, {title:'Could not save', actionLabel:'Retry', onAction(){}});
  assert.match(recovery, /aria-live="polite"/);
  assert.match(recovery, /aria-label="Retry"/);

  const luminance = hex => {
    const values = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
    return values[0]*0.2126 + values[1]*0.7152 + values[2]*0.0722;
  };
  for (const color of ui.stackrGradients.actionPrimary) assert.ok(1.05/(luminance(color)+0.05) >= 4.5, `White labels need 4.5:1 contrast at ${color}`);
  console.log('UI standardisation contracts passed: typography, rendered field semantics, rating keyboard/disabled state, dialog dismissal, recovery and gradient contrast.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
