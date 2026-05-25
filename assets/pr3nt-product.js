(function(){
  function initProduct(root){
    (root||document).querySelectorAll('[data-p-product-gallery]:not([data-product-ready])').forEach(function(gallery){
      gallery.dataset.productReady='true';
      var main=gallery.querySelector('[data-p-product-main]');
      if(!main) return;
      gallery.querySelectorAll('[data-p-product-thumb]').forEach(function(btn){
        btn.addEventListener('click',function(){
          gallery.querySelectorAll('[data-p-product-thumb]').forEach(function(item){item.classList.remove('is-active')});
          btn.classList.add('is-active');
          var html=btn.querySelector('template');
          if(html) main.innerHTML=html.innerHTML;
        });
      });
    });
  }
  document.addEventListener('DOMContentLoaded',function(){initProduct(document)});
  document.addEventListener('shopify:section:load',function(event){initProduct(event.target)});
})();