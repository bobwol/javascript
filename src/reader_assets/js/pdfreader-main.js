var pdf_url_lquery, pdf_target_page;
initialize_reader(function(app_data, pdf_url, pdf_url_dir, 
                           external_b, doc_query) {
  if(!pdf_url)
    return;
  var pdf_viewer = $('.pdfviewer');
  pdf_url_lquery = querystring.parse(librelio_url_query(pdf_url));
  pdf_target_page = parseInt(url('#', document.location+'') || 
                             pdf_url_lquery.wapage);


  PDFJS.disableRange = true;
  if(!isNaN(pdf_target_page))
    pdf_viewer.pdfviewer('set', 'curPageIndex', pdf_target_page);
  pdf_viewer.pdfviewer('loadDocument', pdf_url, function(err)
    {
      if(err)
        return notifyError(err);
    });
  pdf_viewer.bind('new-link', function(ev, data, page)
     {
       if(data.url)
       {
         data.protocol = url('protocol', data.url);
         data.real_url = data.url;
         data.url = librelio_pdf_resolve_url(data.url, pdf_url_dir);
       }
     });
  pdf_viewer.bind('openlink', function(ev, obj)
     {
       var data = obj.data,
       path_str = url('path', data.real_url);
       
       // buy:// protocol
       if(data.protocol == 'buy')
       {
         if(app_data)
         {
           var type = app_data.code_service ? 'code' : 
             (app_data.user_service ? 'user' : null);
           var service_name = app_data.code_service ? app_data.code_service : 
             (app_data.user_service ? app_data.user_service : null);
           if(!type)
             return;
           purchase_dialog_open({
             type: type,
             client: app_data.client_name,
             app: app_data.magazine_name, 
             service: service_name,
             urlstring: path_str
           });
         }
         obj.return_value = false;
       }
     });
  $('.portrait-mode-btn').click(function(){ 
    change_display_mode('portrait');
    return false;
  });
  $('.book-mode-btn').click(function(){ 
    change_display_mode('book');
    return false;
  });
  function change_display_mode(disp_mode)
  {
    var display_mode = $('.pdfviewer').pdfviewer('get', 'display_mode');
    if(display_mode != disp_mode)
      $('.pdfviewer').pdfviewer('set', 'display_mode', disp_mode);
  }

});
