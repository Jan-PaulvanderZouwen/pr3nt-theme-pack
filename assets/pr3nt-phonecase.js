(function(){
  var models=[
    {brand:'Apple',model:'iPhone 16 Pro',layout:'three',hint:'3 camera’s, actieknop, Dynamic Island'},
    {brand:'Apple',model:'iPhone 16',layout:'two',hint:'2 camera’s verticaal, Dynamic Island'},
    {brand:'Apple',model:'iPhone 15 Pro',layout:'three',hint:'3 camera’s, USB-C, Dynamic Island'},
    {brand:'Apple',model:'iPhone 15',layout:'two',hint:'2 camera’s diagonaal, USB-C'},
    {brand:'Apple',model:'iPhone 14 Pro',layout:'three',hint:'3 camera’s, Dynamic Island'},
    {brand:'Apple',model:'iPhone 14',layout:'two',hint:'2 camera’s diagonaal'},
    {brand:'Apple',model:'iPhone 13',layout:'two',hint:'2 camera’s diagonaal'},
    {brand:'Apple',model:'iPhone 12',layout:'two',hint:'2 camera’s verticaal'},
    {brand:'Samsung',model:'Galaxy S24',layout:'three',hint:'3 losse camera’s onder elkaar'},
    {brand:'Samsung',model:'Galaxy S23',layout:'three',hint:'3 losse camera’s onder elkaar'},
    {brand:'Google',model:'Pixel 8',layout:'one',hint:'camera-bar aan de achterkant'}
  ];
  var colors=[
    ['Mat zwart','#101820',0],['Soft wit','#f7f4ed',0],['Sage groen','#6f8f75',2.5],['Sand beige','#cdbf9f',2.5],['Rood','#b73832',2.5],['Blauw','#305f93',2.5]
  ];
  var textures=[
    ['Smooth','linear-gradient(135deg,rgba(255,255,255,.10),rgba(255,255,255,0))',0],
    ['Grid','linear-gradient(45deg,rgba(255,255,255,.22) 1px,transparent 1px),linear-gradient(-45deg,rgba(255,255,255,.14) 1px,transparent 1px)',2.5],
    ['Carbon','repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 5px,rgba(0,0,0,.16) 5px 10px)',3.5],
    ['Wave','radial-gradient(circle at 20% 20%,rgba(255,255,255,.22),transparent 20%),repeating-linear-gradient(120deg,rgba(255,255,255,.16) 0 7px,transparent 7px 18px)',3.5],
    ['Stone','radial-gradient(circle at 30% 35%,rgba(255,255,255,.22),transparent 12%),radial-gradient(circle at 70% 62%,rgba(0,0,0,.18),transparent 18%)',4.5],
    ['Tech','linear-gradient(90deg,rgba(0,208,132,.28) 1px,transparent 1px),linear-gradient(0deg,rgba(255,255,255,.14) 1px,transparent 1px)',4.5]
  ];
  var cases=[['Slim Case','Dun, strak en lichtgewicht',24.95],['Flex Case','Buigzamer voor dagelijks gebruik',27.95],['Rugged Case','Extra dik en stoer met meer bescherming',32.95]];
  function euro(n){return '€'+Number(n).toFixed(2).replace('.',',')}
  function init(root){(root||document).querySelectorAll('[data-phonecase-config]:not([data-ready])').forEach(setup)}
  function setup(el){
    el.dataset.ready='1';
    var state={step:0,model:models[0],case:cases[0],color:colors[0],texture:textures[0],text:'',pos:'center',font:'Inter',discount:false,started:false,left:600};
    var steps=el.querySelectorAll('[data-step]'), progress=el.querySelectorAll('[data-progress]'), phone=el.querySelector('[data-preview-phone]'), camera=el.querySelector('[data-camera]'), design=el.querySelector('[data-design-text]'), price=el.querySelectorAll('[data-price]'), timer=el.querySelector('[data-timer]'), form=el.querySelector('[data-phonecase-form]');
    function startTimer(){if(state.started)return;state.started=true;var id=setInterval(function(){state.left--;if(state.left<=0){clearInterval(id);state.discount=false}else state.discount=true;render();},1000)}
    function total(){var t=state.case[2]+state.color[2]+state.texture[2]; if(state.text)t+=1.5; if(state.discount)t*=.9; return t}
    function render(){
      steps.forEach(function(s,i){s.classList.toggle('is-active',i===state.step)}); progress.forEach(function(p,i){p.classList.toggle('is-active',i<=state.step)});
      if(phone){phone.style.setProperty('--case-color',state.color[1]);phone.style.setProperty('--case-texture',state.texture[1]);phone.style.setProperty('--design-font',state.font);}
      if(camera)camera.dataset.layout=state.model.layout;
      if(design){design.textContent=state.text;design.dataset.pos=state.pos;design.hidden=!state.text;}
      price.forEach(function(p){p.textContent=euro(total())});
      if(timer){var m=Math.floor(state.left/60),s=state.left%60;timer.textContent=(m+':'+String(s).padStart(2,'0'));}
      if(form){form.querySelector('[name="properties[Telefoon]"]').value=state.model.model;form.querySelector('[name="properties[Type hoesje]"]').value=state.case[0];form.querySelector('[name="properties[Kleur]"]').value=state.color[0];form.querySelector('[name="properties[Texture]"]').value=state.texture[0];form.querySelector('[name="properties[Tekst]"]').value=state.text;form.querySelector('[name="properties[Tekstpositie]"]').value=state.pos;form.querySelector('[name="properties[Configurator prijs]"]').value=euro(total());}
    }
    function fill(){
      var ml=el.querySelector('[data-model-list]'); if(ml)ml.innerHTML=models.map(function(m,i){return '<button type="button" class="p-choice-card '+(i==0?'is-active':'')+'" data-model-index="'+i+'"><span class="p-choice-visual"><i></i></span><span class="p-choice-copy"><strong>'+m.model+'</strong><span>'+m.hint+'</span></span><span class="p-choice-price">'+m.brand+'</span></button>'}).join('');
      var cl=el.querySelector('[data-case-list]'); if(cl)cl.innerHTML=cases.map(function(c,i){return '<button type="button" class="p-choice-card '+(i==0?'is-active':'')+'" data-case-index="'+i+'"><span class="p-choice-visual"><i></i></span><span class="p-choice-copy"><strong>'+c[0]+'</strong><span>'+c[1]+'</span></span><span class="p-choice-price">'+euro(c[2])+'</span></button>'}).join('');
      var col=el.querySelector('[data-color-list]'); if(col)col.innerHTML=colors.map(function(c,i){return '<button type="button" class="p-swatch '+(i==0?'is-active':'')+'" data-color-index="'+i+'"><i style="--swatch:'+c[1]+'"></i>'+c[0]+'</button>'}).join('');
      var tl=el.querySelector('[data-texture-list]'); if(tl)tl.innerHTML=textures.map(function(t,i){return '<button type="button" class="p-swatch '+(i==0?'is-active':'')+'" data-texture-index="'+i+'"><i style="--swatch:#101820;background:'+t[1]+'"></i>'+t[0]+'</button>'}).join('');
    }
    fill();render();
    el.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return; if(b.matches('[data-next]')){state.step=Math.min(4,state.step+1);startTimer();render()} if(b.matches('[data-back]')){state.step=Math.max(0,state.step-1);render()} if(b.dataset.modelIndex){state.model=models[+b.dataset.modelIndex];mark(b);startTimer();render()} if(b.dataset.caseIndex){state.case=cases[+b.dataset.caseIndex];mark(b);startTimer();render()} if(b.dataset.colorIndex){state.color=colors[+b.dataset.colorIndex];mark(b);startTimer();render()} if(b.dataset.textureIndex){state.texture=textures[+b.dataset.textureIndex];mark(b);startTimer();render()} if(b.dataset.pos){state.pos=b.dataset.pos;mark(b);render()} if(b.matches('[data-scroll-config]'))el.scrollIntoView({behavior:'smooth',block:'start'});});
    el.addEventListener('input',function(e){if(e.target.matches('[data-design-input]')){state.text=e.target.value.slice(0,22);startTimer();render()} if(e.target.matches('[data-model-search]')){var q=e.target.value.toLowerCase();el.querySelectorAll('[data-model-index]').forEach(function(btn){btn.hidden=btn.textContent.toLowerCase().indexOf(q)===-1})}});
    el.addEventListener('change',function(e){if(e.target.matches('[data-font]')){state.font=e.target.value;render()}});
    function mark(b){var group=b.parentElement; if(group)group.querySelectorAll('button').forEach(function(x){x.classList.remove('is-active')}); b.classList.add('is-active')}
  }
  document.addEventListener('DOMContentLoaded',function(){init(document)});document.addEventListener('shopify:section:load',function(e){init(e.target)});
})();