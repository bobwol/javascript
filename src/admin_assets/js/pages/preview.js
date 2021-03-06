$(function()
{
  $('#preview-content').hide();
  var app_name = storage.getItem(config.storageAppNameKey),
  app_dir = get_app_dir(app_name);
  if(!app_name)
    return;
  awsS3Ready(function()
    {
      awsS3.getObject({
        Bucket: config.s3Bucket,
        Key: app_dir + '/APP_/Uploads/setup.plist',
      }, function(err, res)
         {
           if(err && err.code != 'NoSuchKey')
             return handleAWSS3Error(err);
           if(err)
             return notifyUserError("You should setup app first! <a href=\"setup.html\">Click Here!</a>");
           $('#preview-content').show();
           var setup_obj = res ? $.plist($.parseXML(res.Body.toString())) : {},
           base_url = '//reader.librelio.com',
           frame_src = base_url + '?' + querystring.stringify({
             wapublisher: s3AuthObj.rootDirectory,
             waapp: app_name
           }),
           frame_src_html5 = base_url + '?' + querystring.stringify({
             wapublisher: s3AuthObj.rootDirectory,
             waapp: app_name, 
             waversion: 'html5'
           });
           // set app active state
           function set_toggle_name()
           {
             if(setup_obj.Active)
               this.text(_('Deactivate'));
             else
               this.text(_('Activate'));
             return this;
           }
           set_toggle_name.call($('#toggle-app')).bind('click', function()
             {
               var $this = $(this);
               $this.prop('disabled', true);
               setup_obj.Active = !setup_obj.Active;
               awsS3.putObject({
                 Bucket: config.s3Bucket,
                 Key: app_dir + '/APP_/Uploads/setup.plist',
                 Body: $.plist('toString', setup_obj),
                 CacheControl: 'must-revalidate, max-age=0'
               }, function(err, res)
                  {

                    if(err)
                    {
                      setup_obj.Active = !setup_obj.Active;
                      handleAWSS3Error(err);
                    }
                    $this.prop('disabled', false);
                    set_toggle_name.call($this);
                    if(!err)
                    {
                      if(setup_obj.Active)
                      {
                        reader.show();
                        reader.prop('src', frame_src_html5);
                      }
                      else
                        reader.hide();
                    }
                  });
             });
           
           $('#reader-link').attr('href', frame_src);
           var reader = $('<iframe/>');
           reader.prop('id', 'reader');
           if(setup_obj.Active)
             reader.attr('src', frame_src_html5);
           else
             reader.hide();
           $('#reader-wrapper').append(reader);
         });
    });
});
