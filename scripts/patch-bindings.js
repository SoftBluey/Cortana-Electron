// Re-applies the fix for @microsoft/dynwinrt 0.1.0-preview.18 event
// wrappers after `.winapp/bindings` is regenerated. Idempotent: safe to
// run repeatedly.
'use strict';

const fs = require('fs');
const path = require('path');

const override = process.argv[2];
const BASE = path.join(__dirname, '..', '.winapp', 'bindings');

const FILES = [
  {
    name: 'SpeechContinuousRecognitionSession.js',
    targets: [
      {
        argsClass: 'SpeechContinuousRecognitionCompletedEventArgs',
        original:
          'const wrapped = (__a0__, __a1__) => callback(((v) => v.isNull() ? null : SpeechContinuousRecognitionSession._fromNative(v))(__a0__), ((v) => v.isNull() ? null : (__get_SpeechContinuousRecognitionCompletedEventArgs())._fromNative(v))(__a1__));',
        patched:
          'const unwrap = (a) => {\n' +
          '            let snd = null, args = null;\n' +
          '            for (const v of (Array.isArray(a) ? a : [a])) {\n' +
          '                if (v && typeof v.isNull === \'function\' && !v.isNull()) {\n' +
          '                    if (!args) { try { args = (__get_SpeechContinuousRecognitionCompletedEventArgs())._fromNative(v); continue; } catch (e) {} }\n' +
          '                    if (!snd) { try { snd = SpeechContinuousRecognitionSession._fromNative(v); continue; } catch (e) {} }\n' +
          '                }\n' +
          '            }\n' +
          '            return [snd, args];\n' +
          '        };\n' +
          '        const wrapped = (packed) => { const u = unwrap(packed); callback(u[0], u[1]); };'
      },
      {
        argsClass: 'SpeechContinuousRecognitionResultGeneratedEventArgs',
        original:
          'const wrapped = (__a0__, __a1__) => callback(((v) => v.isNull() ? null : SpeechContinuousRecognitionSession._fromNative(v))(__a0__), ((v) => v.isNull() ? null : (__get_SpeechContinuousRecognitionResultGeneratedEventArgs())._fromNative(v))(__a1__));',
        patched:
          'const unwrap = (a) => {\n' +
          '            let snd = null, args = null;\n' +
          '            for (const v of (Array.isArray(a) ? a : [a])) {\n' +
          '                if (v && typeof v.isNull === \'function\' && !v.isNull()) {\n' +
          '                    if (!args) { try { args = (__get_SpeechContinuousRecognitionResultGeneratedEventArgs())._fromNative(v); continue; } catch (e) {} }\n' +
          '                    if (!snd) { try { snd = SpeechContinuousRecognitionSession._fromNative(v); continue; } catch (e) {} }\n' +
          '                }\n' +
          '            }\n' +
          '            return [snd, args];\n' +
          '        };\n' +
          '        const wrapped = (packed) => { const u = unwrap(packed); callback(u[0], u[1]); };'
      }
    ]
  },
  {
    name: 'SpeechRecognizer.js',
    targets: [
      {
        argsClass: 'SpeechRecognizerStateChangedEventArgs',
        original:
          'const wrapped = (__a0__, __a1__) => callback(((v) => v.isNull() ? null : SpeechRecognizer._fromNative(v))(__a0__), ((v) => v.isNull() ? null : (__get_SpeechRecognizerStateChangedEventArgs())._fromNative(v))(__a1__));',
        patched:
          'const unwrap = (a) => {\n' +
          '            let snd = null, args = null;\n' +
          '            for (const v of (Array.isArray(a) ? a : [a])) {\n' +
          '                if (v && typeof v.isNull === \'function\' && !v.isNull()) {\n' +
          '                    if (!args) { try { args = (__get_SpeechRecognizerStateChangedEventArgs())._fromNative(v); continue; } catch (e) {} }\n' +
          '                    if (!snd) { try { snd = SpeechRecognizer._fromNative(v); continue; } catch (e) {} }\n' +
          '                }\n' +
          '            }\n' +
          '            return [snd, args];\n' +
          '        };\n' +
          '        const wrapped = (packed) => { const u = unwrap(packed); callback(u[0], u[1]); };'
      },
      {
        argsClass: 'SpeechRecognitionQualityDegradingEventArgs',
        original:
          'const wrapped = (__a0__, __a1__) => callback(((v) => v.isNull() ? null : SpeechRecognizer._fromNative(v))(__a0__), ((v) => v.isNull() ? null : (__get_SpeechRecognitionQualityDegradingEventArgs())._fromNative(v))(__a1__));',
        patched:
          'const unwrap = (a) => {\n' +
          '            let snd = null, args = null;\n' +
          '            for (const v of (Array.isArray(a) ? a : [a])) {\n' +
          '                if (v && typeof v.isNull === \'function\' && !v.isNull()) {\n' +
          '                    if (!args) { try { args = (__get_SpeechRecognitionQualityDegradingEventArgs())._fromNative(v); continue; } catch (e) {} }\n' +
          '                    if (!snd) { try { snd = SpeechRecognizer._fromNative(v); continue; } catch (e) {} }\n' +
          '                }\n' +
          '            }\n' +
          '            return [snd, args];\n' +
          '        };\n' +
          '        const wrapped = (packed) => { const u = unwrap(packed); callback(u[0], u[1]); };'
      },
      {
        argsClass: 'SpeechRecognitionHypothesisGeneratedEventArgs',
        original:
          'const wrapped = (__a0__, __a1__) => callback(((v) => v.isNull() ? null : SpeechRecognizer._fromNative(v))(__a0__), ((v) => v.isNull() ? null : (__get_SpeechRecognitionHypothesisGeneratedEventArgs())._fromNative(v))(__a1__));',
        patched:
          'const unwrap = (a) => {\n' +
          '            let snd = null, args = null;\n' +
          '            for (const v of (Array.isArray(a) ? a : [a])) {\n' +
          '                if (v && typeof v.isNull === \'function\' && !v.isNull()) {\n' +
          '                    if (!args) { try { args = (__get_SpeechRecognitionHypothesisGeneratedEventArgs())._fromNative(v); continue; } catch (e) {} }\n' +
          '                    if (!snd) { try { snd = SpeechRecognizer._fromNative(v); continue; } catch (e) {} }\n' +
          '                }\n' +
          '            }\n' +
          '            return [snd, args];\n' +
          '        };\n' +
          '        const wrapped = (packed) => { const u = unwrap(packed); callback(u[0], u[1]); };'
      }
    ]
  }
];

let processedAny = false;

for (const entry of FILES) {
  if (override && !entry.name.endsWith(path.basename(override))) continue;
  const file = path.join(BASE, entry.name);
  if (!fs.existsSync(file)) {
    console.log('[patch-bindings] bindings not generated yet — skipping ' + entry.name + '.');
    continue;
  }
  processedAny = true;
  let source = fs.readFileSync(file, 'utf8');
  let changed = false;

  for (const target of entry.targets) {
    if (source.includes(target.original)) {
      source = source.split(target.original).join(target.patched);
      changed = true;
      console.log('[patch-bindings] patched ' + target.argsClass + ' wrapper.');
    } else if (source.includes(target.patched)) {
      console.log('[patch-bindings] ' + target.argsClass + ' wrapper already patched — no-op.');
    } else {
      console.warn('[patch-bindings] WARNING: expected wrapper text not found for ' +
        target.argsClass + ' in ' + entry.name + ' — generated by an unexpected ' +
        'dynwinrt version? Event callbacks may be broken.');
    }
  }

  if (changed) {
    fs.writeFileSync(file, source, 'utf8');
  }
}

if (!processedAny && override) {
  console.log('[patch-bindings] no matching binding files found for "' + override + '".');
}
process.exit(0);
