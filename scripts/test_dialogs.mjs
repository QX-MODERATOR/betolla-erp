import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Window} from '../.local-tests/node_modules/happy-dom/lib/index.js';

// Dialog accessibility (DialogA11y) and the app's confirm/prompt dialog, rendered with React in a
// simulated browser (happy-dom). .tsx files are compiled on the fly with TypeScript.
const root=new URL('../',import.meta.url);
const ts=(await import(new URL('node_modules/typescript/lib/typescript.js',root).href)).default;
registerHooks({
  resolve(s,c,next){
    if(s.startsWith('@/')){
      for(const ext of ['.tsx','.ts']){
        const url=new URL(s.slice(2)+ext,root);
        try{readFileSync(url);return next(url.href,c);}catch{}
      }
    }
    return next(s,c);
  },
  load(url,c,next){
    if(url.endsWith('.tsx')){
      const source=readFileSync(fileURLToPath(url),'utf8');
      const out=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
      return {format:'module',source:out.outputText,shortCircuit:true};
    }
    return next(url,c);
  },
});

const win=new Window({url:'https://erp.test/'});
for(const k of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','MouseEvent','KeyboardEvent','Event','requestAnimationFrame','getComputedStyle'])
  Object.defineProperty(globalThis,k,{value:k==='window'?win:win[k],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// happy-dom has no layout: treat every element as visible for focus trapping.
Object.defineProperty(win.HTMLElement.prototype,'offsetParent',{get(){return this.parentElement;}});

const React=(await import('react')).default;
const {act}=await import('react');
const {createRoot}=await import('react-dom/client');
const {X}=await import('lucide-react');
const {DialogA11y}=await import('../components/common/dialog-a11y.tsx');
const {ConfirmProvider,useConfirm}=await import('../components/common/confirm-dialog.tsx');
const h=React.createElement;
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
const key=(k,opts={})=>act(async()=>{document.dispatchEvent(new win.KeyboardEvent('keydown',{key:k,bubbles:true,...opts}));});

const container=document.createElement('div');document.body.appendChild(container);
const rootEl=createRoot(container);

let closed=0,overlayCloses=0,api=null;
function Harness({open,second}){
  api=useConfirm();
  return h('div',null,
    h('button',{id:'t-opener'},'فتح'),
    open&&h('div',{'data-dialog':'',className:'fixed inset-0'},
      h('div',{id:'t-panel'},
        h('h3',null,'تفاصيل الطلب'),
        h('input',{id:'t-first'}),
        h('button',{id:'t-save'},'حفظ'),
        h('button',{id:'t-x',onClick:()=>closed++},h(X)))),
    second&&h('div',{'data-dialog':'',id:'t-overlay2',onClick:e=>{if(e.target===e.currentTarget)overlayCloses++;}},
      h('div',{id:'t-panel2'},h('p',null,'بدون زر إغلاق'),h('button',{id:'t-ok'},'موافق'))));
}
const render=async props=>act(async()=>{rootEl.render(h(ConfirmProvider,null,h(DialogA11y),h(Harness,props)));});

try{
  await render({open:false});
  document.getElementById('t-opener').focus();
  assert.equal(document.activeElement.id,'t-opener');

  // Opening: semantics, name and focus.
  await render({open:true});await flush();
  const panel=document.getElementById('t-panel');
  assert.equal(panel.getAttribute('role'),'dialog');
  assert.equal(panel.getAttribute('aria-modal'),'true');
  const title=document.getElementById(panel.getAttribute('aria-labelledby'));
  assert.equal(title.textContent,'تفاصيل الطلب');
  assert.equal(document.activeElement,panel,'focus moves into the dialog (not into a text field)');

  // Tab stays inside.
  document.getElementById('t-x').focus();
  await key('Tab');
  assert.equal(document.activeElement.id,'t-first','Tab from the last control wraps to the first');
  await key('Tab',{shiftKey:true});
  assert.equal(document.activeElement.id,'t-x','Shift+Tab from the first wraps to the last');
  document.getElementById('t-opener').focus();
  await key('Tab');
  assert.equal(document.activeElement.id,'t-first','focus outside is pulled back in');

  // Escape presses the X button.
  await key('Escape');
  assert.equal(closed,1);

  // Closing returns focus to where it was.
  await render({open:false});await flush();
  assert.equal(document.activeElement.id,'t-opener');

  // A dialog without a close button: Escape clicks its overlay.
  await render({open:false,second:true});await flush();
  await key('Escape');
  assert.equal(overlayCloses,1);
  await render({open:false});await flush();

  // Confirm dialog.
  let answer;
  await act(async()=>{api.confirm({title:'حذف العطلة',message:'متأكد؟',confirmLabel:'حذف',danger:true}).then(v=>{answer=v;});});
  await flush();
  const dialog=document.querySelector('form');
  assert.ok(dialog,'confirm dialog is shown');
  assert.equal(dialog.getAttribute('role'),'dialog');
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,'حذف العطلة');
  await act(async()=>{[...dialog.querySelectorAll('button')].find(b=>b.textContent==='حذف').click();});
  await flush();
  assert.equal(answer,true);
  assert.equal(document.querySelector('form'),null);

  // Escape cancels.
  await act(async()=>{api.confirm({title:'متابعة؟'}).then(v=>{answer=v;});});
  await flush();
  await key('Escape');await flush();
  assert.equal(answer,false);

  // Prompt: required text, trimmed.
  await act(async()=>{api.prompt({title:'إلغاء السلفة',label:'السبب',required:true}).then(v=>{answer=v;});});
  await flush();
  let form=document.querySelector('form');
  const submit=form.querySelector('button[type="submit"]');
  assert.equal(submit.disabled,true,'empty required reason cannot be submitted');
  const area=form.querySelector('textarea');
  await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype,'value').set;
    setter.call(area,'  خطأ في المبلغ  ');
    area.dispatchEvent(new win.Event('input',{bubbles:true}));
  });
  assert.equal(form.querySelector('button[type="submit"]').disabled,false);
  await act(async()=>{form.querySelector('button[type="submit"]').click();});
  await flush();
  assert.equal(answer,'خطأ في المبلغ');
  // Cancelling a prompt gives null.
  await act(async()=>{api.prompt({title:'سبب'}).then(v=>{answer=v;});});
  await flush();
  await act(async()=>{[...document.querySelector('form').querySelectorAll('button')].find(b=>b.textContent==='إلغاء').click();});
  await flush();
  assert.equal(answer,null);

  console.log('PASS test_dialogs (dialog role/name, focus in/trap/restore, Escape via X or overlay, confirm and prompt dialogs)');
}finally{
  await act(async()=>rootEl.unmount());
  await win.happyDOM.close();
}
