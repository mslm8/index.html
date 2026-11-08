const MODELS=new Set(["black-forest-labs/FLUX.1-dev","Qwen/Qwen-Image","stabilityai/stable-diffusion-3-medium-diffusers"]);
export default {async fetch(request,env){
 const origin=request.headers.get("Origin")||"",allowed=env.ALLOWED_ORIGIN||"";
 const cors={"Access-Control-Allow-Origin":allowed==="*"? "*":(origin===allowed?origin:"null"),"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
 if(request.method==="OPTIONS"){if(allowed&&allowed!=="*"&&origin!==allowed)return new Response("Origin not allowed",{status:403});return new Response(null,{status:204,headers:cors});}
 const u=new URL(request.url);
 if(u.pathname==="/health"&&request.method==="GET")return Response.json({ok:true,service:"AI Animator image proxy"},{headers:cors});
 if(u.pathname!=="/generate"||request.method!=="POST")return Response.json({error:"Not found"},{status:404,headers:cors});
 if(allowed&&allowed!=="*"&&origin!==allowed)return Response.json({error:"Origin not allowed"},{status:403,headers:cors});
 if(!env.HF_TOKEN)return Response.json({error:"HF_TOKEN secret is missing"},{status:503,headers:cors});
 let body;try{const raw=await request.text();if(raw.length>12000)throw Error();body=JSON.parse(raw)}catch{return Response.json({error:"Invalid or oversized JSON"},{status:400,headers:cors})}
 const prompt=typeof body.prompt==="string"?body.prompt.trim():"",model=typeof body.model==="string"?body.model:"";
 if(!prompt||prompt.length>2000)return Response.json({error:"Prompt must be 1–2000 characters"},{status:400,headers:cors});
 if(!MODELS.has(model))return Response.json({error:"Model is not allowed"},{status:400,headers:cors});
 try{const upstream=await fetch("https://router.huggingface.co/hf-inference/models/"+model,{method:"POST",headers:{"Authorization":"Bearer "+env.HF_TOKEN,"Content-Type":"application/json","Accept":"image/*"},body:JSON.stringify({inputs:prompt})});
 if(!upstream.ok){const detail=(await upstream.text()).slice(0,1000);return Response.json({error:"Inference provider returned "+upstream.status,detail},{status:upstream.status,headers:cors})}
 const type=upstream.headers.get("Content-Type")||"";if(!type.startsWith("image/"))return Response.json({error:"Provider did not return an image"},{status:502,headers:cors});
 return new Response(upstream.body,{headers:{...cors,"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})
 }catch{return Response.json({error:"Inference request failed"},{status:502,headers:cors})}
}};