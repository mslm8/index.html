/* ToonVerse Free Image Provider
 * Public Hugging Face ZeroGPU Space adapter. No API key, paid inference,
 * or local vector-image fallback is used. Availability and free quotas are
 * controlled by the public Space and may change.
 */
(function(root){
  'use strict';
  const SPACE_ID='mrfakename/Z-Image-Turbo';
  const SPACE_HOST='https://mrfakename-z-image-turbo.hf.space';
  const CONFIG_URL=SPACE_HOST+'/config';
  let configPromise=null;
  const setStatus=(fn,message)=>{if(typeof fn==='function')fn(message);};
  async function fetchTimed(url,options={},timeoutMs=30000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await fetch(url,{...options,signal:controller.signal,mode:'cors',credentials:'omit'});}
    finally{clearTimeout(timer);}
  }
  async function getConfig(force=false){
    if(force)configPromise=null;
    if(!configPromise)configPromise=fetchTimed(CONFIG_URL,{headers:{Accept:'application/json'}},25000).then(async response=>{
      if(!response.ok)throw new Error('فضای عمومی مدل تصویر در دسترس نیست (HTTP '+response.status+').');
      const config=await response.json();
      if(!Array.isArray(config.components)||!Array.isArray(config.dependencies))throw new Error('ساختار API فضای مدل تصویر معتبر نیست.');
      return config;
    }).catch(error=>{configPromise=null;throw error;});
    return configPromise;
  }
  const componentType=component=>String(component?.type||'').toLowerCase();
  const propsOf=component=>component?.props&&typeof component.props==='object'?component.props:{};
  function chooseEndpoint(config){
    const byId=new Map(config.components.map(component=>[component.id,component]));
    const candidates=config.dependencies.filter(dep=>dep&&dep.api_name&&Array.isArray(dep.inputs)&&dep.inputs.some(id=>componentType(byId.get(id))==='textbox'));
    const imageCandidates=candidates.filter(dep=>(dep.outputs||[]).some(id=>['image','gallery'].includes(componentType(byId.get(id)))));
    const selected=imageCandidates[0]||candidates[0];
    if(!selected)throw new Error('در فضای رایگان Hugging Face ورودی متن و مسیر تولید تصویر پیدا نشد.');
    const promptInput=selected.inputs.find(id=>componentType(byId.get(id))==='textbox');
    return {dependency:selected,components:byId,promptInput};
  }
  function defaultInput(component){
    const type=componentType(component),props=propsOf(component);
    if(Object.prototype.hasOwnProperty.call(props,'value'))return props.value;
    if(type==='checkbox')return false;
    if(type==='slider'||type==='number')return Number.isFinite(props.minimum)?props.minimum:(Number.isFinite(props.min)?props.min:0);
    if(type==='dropdown'||type==='radio')return Array.isArray(props.choices)?(props.choices[0]?.[0]??props.choices[0]??null):null;
    return null;
  }
  function valueForInput(component,prompt,options,isPrompt){
    if(isPrompt)return prompt;
    const type=componentType(component),props=propsOf(component);
    const label=String(props.label||'').toLowerCase();
    if(type==='checkbox'&&/random seed|تصادفی/u.test(label))return options.seed==null;
    if((type==='slider'||type==='number')&&/height/u.test(label))return clampDimension(options.height,props);
    if((type==='slider'||type==='number')&&/width/u.test(label))return clampDimension(options.width,props);
    if((type==='slider'||type==='number')&&/inference steps|steps/u.test(label))return 9;
    if(type==='number'&&/seed/u.test(label))return Number.isSafeInteger(options.seed)?options.seed:(Number.isFinite(props.value)?props.value:42);
    return defaultInput(component);
  }
  function clampDimension(value,props){
    const fallback=Number.isFinite(props.value)?props.value:1024;
    const number=Number.isFinite(value)?value:fallback;
    const min=Number.isFinite(props.minimum)?props.minimum:512;
    const max=Number.isFinite(props.maximum)?props.maximum:2048;
    const step=Number.isFinite(props.step)?props.step:64;
    return Math.max(min,Math.min(max,Math.round(number/step)*step));
  }
  function parseSse(body){
    const blocks=String(body||'').split(/\r?\n\r?\n/);
    for(const block of blocks){
      const event=(block.match(/^event:\s*(.+)$/m)||[])[1]||'';
      const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
      if(!data)continue;
      if(event==='error')throw new Error(data.slice(0,500));
      if(event==='complete'||!event){
        try{return JSON.parse(data);}catch(_){continue;}
      }
    }
    throw new Error('پاسخ مدل تصویر کامل نشد یا قالب آن قابل‌خواندن نبود.');
  }
  function findImage(value,depth=0){
    if(depth>8||value==null)return null;
    if(typeof value==='string'){
      if(/^data:image\//i.test(value)||/^https?:\/\//i.test(value))return value;
      if(value.startsWith('/gradio_api/file=')||value.startsWith('/file='))return value;
      return null;
    }
    if(Array.isArray(value)){for(const item of value){const found=findImage(item,depth+1);if(found)return found;}return null;}
    if(typeof value==='object'){
      if(typeof value.url==='string'){const found=findImage(value.url,depth+1);if(found)return found;}
      if(typeof value.path==='string'){const found=findImage(value.path,depth+1);if(found)return found;}
      for(const [key,item] of Object.entries(value)){
        if(['url','path','image','images','data','output','files'].includes(key)){const found=findImage(item,depth+1);if(found)return found;}
      }
    }
    return null;
  }
  async function imageAsDataUrl(value){
    if(/^data:image\//i.test(value))return value;
    const url=/^https?:\/\//i.test(value)?value:SPACE_HOST+(value.startsWith('/')?value:'/gradio_api/file='+encodeURIComponent(value));
    try{
      const response=await fetchTimed(url,{headers:{Accept:'image/*'}},45000);
      if(!response.ok)throw new Error('دانلود تصویر خروجی ناموفق بود (HTTP '+response.status+').');
      const blob=await response.blob();
      return await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result));
        reader.onerror=()=>reject(new Error('خواندن تصویر خروجی ناموفق بود.'));
        reader.readAsDataURL(blob);
      });
    }catch(_){return url;}
  }
  async function generate(prompt,options={}){
    const clean=String(prompt||'').trim().slice(0,3000);
    if(clean.length<3)throw new Error('شرح تصویر خیلی کوتاه است.');
    const status=options.onStatus;
    setStatus(status,'در حال بررسی فضای عمومی مدل تصویر Z-Image Turbo...');
    const config=await getConfig();
    const {dependency,components,promptInput}=chooseEndpoint(config);
    const data=dependency.inputs.map(id=>valueForInput(components.get(id),clean,options,id===promptInput));
    const apiName=String(dependency.api_name).replace(/^\/+/, '');
    setStatus(status,'درخواست به صف رایگان Hugging Face ZeroGPU ارسال شد...');
    const submitted=await fetchTimed(SPACE_HOST+'/gradio_api/call/'+apiName,{
      method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({data})
    },45000);
    if(!submitted.ok)throw new Error('فضای رایگان درخواست را نپذیرفت (HTTP '+submitted.status+'). احتمالاً سهمیه یا صف آن پر شده است.');
    const ticket=await submitted.json();
    if(!ticket?.event_id)throw new Error('شناسه درخواست از فضای مدل دریافت نشد.');
    setStatus(status,'مدل تصویر رایگان در حال تولید است؛ ممکن است به‌دلیل صف عمومی کمی زمان ببرد...');
    const completed=await fetchTimed(SPACE_HOST+'/gradio_api/call/'+apiName+'/'+encodeURIComponent(ticket.event_id),{
      headers:{Accept:'text/event-stream'}
    },240000);
    if(!completed.ok)throw new Error('دریافت نتیجه از مدل رایگان ناموفق بود (HTTP '+completed.status+').');
    const payload=parseSse(await completed.text());
    const image=findImage(payload);
    if(!image)throw new Error('مدل رایگان پاسخ داد اما فایل تصویر در خروجی پیدا نشد.');
    const result=await imageAsDataUrl(image);
    setStatus(status,'تصویر از فضای عمومی Hugging Face دریافت شد.');
    return result;
  }
  async function health(){
    try{const config=await getConfig();chooseEndpoint(config);return {ok:true,provider:'Hugging Face ZeroGPU',space:SPACE_ID};}
    catch(error){return {ok:false,provider:'Hugging Face ZeroGPU',space:SPACE_ID,error:String(error?.message||error)};}
  }
  root.ToonVerseFreeImage={version:'1.0.0',provider:'Hugging Face ZeroGPU',space:SPACE_ID,generate,health};
})(typeof window!=='undefined'?window:globalThis);
