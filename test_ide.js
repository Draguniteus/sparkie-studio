/**
 * IDE Debug Test Script
 * Run this to check IDE functionality
 */

const fs = require('fs');
const path = require('path');

// Check if required elements exist in HTML
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

console.log('=== IDE Debug Test ===\n');

// Check 1: IDE Panel element
const hasIdePanel = html.includes('id="ide-panel"');
console.log(`✓ IDE Panel element exists: ${hasIdePanel}`);

// Check 2: Code button in sidebar
const hasCodeButton = html.includes('data-view="code"');
console.log(`✓ Code button in sidebar: ${hasCodeButton}`);

// Check 3: Check ide.css
const ideCss = fs.readFileSync(path.join(__dirname, 'css/ide.css'), 'utf8');
const hasOpenClass = ideCss.includes('.ide-panel.open');
const hasWidthTransition = ideCss.includes('width: var(--ide-width)');
console.log(`✓ IDE panel open class defined: ${hasOpenClass}`);
console.log(`✓ IDE panel width transition: ${hasWidthTransition}`);

// Check 4: Check ide.js
const ideJs = fs.readFileSync(path.join(__dirname, 'js/ide.js'), 'utf8');
const hasInitFunction = ideJs.includes('init()');
const hasToggleFunction = ideJs.includes('toggle()');
const hasOpenFunction = ideJs.includes('async open()');
const hasEventBinding = ideJs.includes("'[data-view=\"code\"]'");
console.log(`✓ IDE init() function: ${hasInitFunction}`);
console.log(`✓ IDE toggle() function: ${hasToggleFunction}`);
console.log(`✓ IDE open() function: ${hasOpenFunction}`);
console.log(`✓ Event binding for code button: ${hasEventBinding}`);

// Check 5: Check ui.js
const uiJs = fs.readFileSync(path.join(__dirname, 'js/ui.js'), 'utf8');
const hasSwitchView = uiJs.includes('switchView(viewName)');
const hasIdeCall = uiJs.includes("IDE.open()");
console.log(`✓ UI switchView() function: ${hasSwitchView}`);
console.log(`✓ UI calls IDE.open(): ${hasIdeCall}`);

// Check 6: Check if all IDE files exist
const ideFiles = ['ide.js', 'ide.css'];
ideFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    console.log(`✓ IDE ${file} exists: ${exists}`);
});

console.log('\n=== Test Complete ===');
console.log('\nIf all checks passed, the IDE should work.');
console.log('Check browser console for any JavaScript errors.');
