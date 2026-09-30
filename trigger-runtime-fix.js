const Module=require('module');
const load=Module._load;
Module._load=function(req,parent,isMain){
  const out=load.apply(this,arguments);
  if(req==='./triggers'&&parent&&/index\.js$/.test(parent.filename)&&typeof out.getTriggerReply==='function'){
    const original=out.getTriggerReply;
    out.getTriggerReply=async function(body,senderId,threadId,api,event){
      const reply=await original(body,senderId,threadId);
      if(String(reply).trim().toLowerCase()!=='jaiden na naman')return reply;
      const r=event&&event.messageReply,id=r&&(r.senderID||r.senderId||r.sender_id);
      if(!id||!api||typeof api.getUserInfo!=='function')return reply;
      try{const users=await new Promise((a,b)=>api.getUserInfo(String(id),(e,x)=>e?b(e):a(x)));const u=users&&users[String(id)];return u&&u.name?`${u.name} na naman`:reply;}catch{return reply;}
    };
  }
  return out;
};
const ext=Module._extensions['.js'];
Module._extensions['.js']=function(mod,file){
  if(/index\.js$/.test(file)){
    const fs=require('fs');let s=fs.readFileSync(file,'utf8');
    s=s.replace(/getTriggerReply\(\n\s*body,\n\s*senderId,\n\s*threadId\n\s*\)/,'getTriggerReply(\n      body,\n      senderId,\n      threadId,\n      api,\n      event\n    )');
    s=s.replace('sendReplyWithTyping(\n          api,\n          "sino uupakan kong mukhang aso dito?",\n          threadID\n        );','sendReplyWithTyping(api, require("./slash-banats")(), threadID);');
    return mod._compile(s,file);
  }
  return ext(mod,file);
};
