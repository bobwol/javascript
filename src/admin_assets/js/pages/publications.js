var appName = storage.getItem(config.storageAppNameKey),
appDir = get_app_dir(appName);
$(function() {
    function workOnAwsS3()
    {
        formDisplay();
        $pubDlg.find('.fileinput').each(initUploadEl);
        updatePubTable();
    }
    var $pubTable = $(".publicationDataTable"),
    publicationsTable = $pubTable.dataTable({
        "aaSorting": [[ 0, "desc" ]]
    }),
    $pubDlg = $('#pubModal');
  
    activeInactiveEvents($pubTable);
    if(!appName)
        return;
    
    awsS3Ready(workOnAwsS3);
        
    $('.new-pub-btn').click(function()
        {
            if(!awsS3)
                return false;
        });
    $pubDlg.find('.svgedit-btn').bind('click', function()
          {
              var pub = $pubDlg.find('input[name=FolderName]').val(),
              filename = pubDlgEvalAttr($(this).data('filename'));
              if(filename)
              {
                  window.open('svgedit.html?' + path.stringifyQuery({
                      app: appName,
                      filename: pub + '/' + filename
                  }), '_blank');
                  return false;
              }
          });
    $pubDlg.find('.pdfannotedit-btn').bind('click', function()
          {
              var pub = $pubDlg.find('input[name=FolderName]').val(),
              filename = pubDlgEvalAttr($(this).data('filename'));
              if(filename)
              {
                  window.open('pdf-annotation-editor.html?' + 
                              path.stringifyQuery({
                                waurl: appDir + '/' + pub + '/' + filename
                              }), '_blank');
                  return false;
              }
          });

    $("#asset-uploader").pluploadQueue({
        // General settings
        runtimes: 'html5',
        url: 'https://' + config.s3Bucket + '.s3.amazonaws.com',
        //multipart: true,
        
        // Resize images on clientside if we can
        resize : {
            width : 200,
            height : 200,
            quality : 90,
            crop: true // crop to exact dimensions
        },
 
        // Rename files by clicking on their titles
        rename: true,
         
        // Sort files
        sortable: true,
 
        // Enable ability to drag'n'drop files onto the widget (currently only HTML5 supports that)
        dragdrop: true,
 
        // Views to activate
        views: {
            list: true,
            thumbs: true, // Show thumbs
            active: 'thumbs'
        },

        multiple_queues: true
    });
    var asset_uploader = $("#asset-uploader").pluploadQueue();

    if(s3AuthObj.type == 'idFed')
    {
      asset_uploader.unbind('UploadFile');
	    asset_uploader.bind('UploadFile', function(up, file)
          {
              var filename = file.target_name || file.name;
              function onCancelUpload()
              {
                  if(xhr)
                      xhr.abort();
              }
              function unbindEvents()
              {
                  up.unbind('CancelUpload', onCancelUpload)
              }
		      up.bind('CancelUpload', onCancelUpload);
              var  pub = $pubDlg.find('input[name=FolderName]').val(),
              asset_dir = $("#asset-uploader").data('dir'),
              dir = appDir + '/' + pub + (asset_dir ? '/' + asset_dir : ''),
              xhr,
              request = awsS3.putObject({
                  Bucket: config.s3Bucket,
                  Key: dir + '/' + filename,
                  Body: file.getNative()
              }, function(err, res)
                 {
                     unbindEvents();
                     if(err)
                     {
                       console.error(err);
                       up.trigger('Error', {
                         code : plupload.HTTP_ERROR,
                         message : plupload.translate('HTTP Error.'),
                         file : file,
                         response: err+'',
                         status: xhr ? xhr.status : _('Unknown'),
                         responseHeaders: 
                               xhr ? xhr.getAllResponseHeaders() : {}
                       });
                       return;
                     }
                   file.loaded = file.size;
                   up.trigger('UploadProgress', file);
                   
	                 file.status = plupload.DONE;
                   up.trigger('FileUploaded', file, {
                     response: 'success',
                     status: 200,
                     responseHeaders: {}
                   });
                 });
              xhr = request.httpRequest.stream;
              if(xhr && xhr.upload)
                  $(xhr.upload).on('progress', function(ev)
                     {
                       ev = ev.originalEvent;
                       file.loaded = ev.loaded;
                       up.trigger('UploadProgress', file);
                     });
          });
    }
    else
    {
        asset_uploader.bind("BeforeUpload", function(up, file) {
            var params = asset_uploader.settings.multipart_params;
            params.key = $("#asset-uploader").data('current_dir') + file.name;
            params.Filename = file.name;
        });
    }
    function setPLUploadInfoForPub(pub)
    {
        var d = new Date(new Date().getTime() + (60 * 60 * 1000)),
        asset_dir = $("#asset-uploader").data('dir'),
        dir = appDir + '/' + pub + '/' + (asset_dir ? asset_dir + '/' : ''),
        policy = {
            "expiration": d.toISOString(),
            "conditions": [ 
                {"bucket": config.s3Bucket}, 
                ["starts-with", "$key", dir],
                {"acl": "private"},
                ["starts-with", "$Content-Type", ""],
                ["starts-with", "$name", ""],
                ["starts-with", "$Filename", ""],
                ["starts-with", "$success_action_status", ""]
            ]
        },
        policy_str = CryptoJS.enc.Base64.stringify(
            CryptoJS.enc.Utf8.parse(JSON.stringify(policy))),
        signature = CryptoJS.HmacSHA1(policy_str, s3AuthObj.secretAccessKey)
            .toString(CryptoJS.enc.Base64);
        var post = {
            acl: 'private',
            AWSAccessKeyId: s3AuthObj.accessKeyId,
            policy: policy_str,
            signature: signature,
            'Content-Type': '$Content-Type',
            success_action_status: '201'
        };
        $("#asset-uploader").data('current_dir', dir);
        asset_uploader.setOption('multipart_params', post);
        asset_uploader.splice(0, asset_uploader.files.length);
    }
    function uploadElEvalFilename(el, action)
    {
        var pub = $pubDlg.data('pubObj'),
        $this = $(el),
        ext = el.files && el.files.length > 0 ?
            path.fileExtension(el.files[0].name) : '';
        if(pub)
        {
            // use existing extension
            // if it's there
            if($this.hasClass('paidfileupload'))
                ext = (action == 'delete') ? pub.paid_ext || ext :
                ext || pub.paid_ext;
            else if($this.hasClass('freefileupload'))
                ext = (action == 'delete') ? pub.free_ext || ext :
                ext || pub.free_ext;
        }
        return pubDlgEvalAttr($this.attr('name'), { fileext: ext });
    }
    function uploadFileUpdate($upload)
    {
        $upload.find('input[type=file]').each(function()
            {
                var file = uploadElEvalFilename(this),
                extensions = [ 'pdf', 'svg' ];
                for(var i = 0, l = extensions.length; i < l; ++i)
                {
                  var ext = extensions[i];
                  $upload.toggleClass('fileinput-' + ext, 
                                      (path.fileExtension(file) == '.' + ext));
                }
            });
    }
    function uploadFileUpdateExtension(inp)
    {
        var pub = $pubDlg.data('pubObj') || {},
        $inp = $(inp),
        ext = inp.files && inp.files.length > 0 ?
            path.fileExtension(inp.files[0].name) : '';
        if($inp.hasClass('paidfileupload'))
            pub.paid_ext = ext;
        else if($inp.hasClass('freefileupload'))
            pub.free_ext = ext;
        $pubDlg.data('pubObj', pub);
    }
    function initUploadEl()
    {
        var $upload = $(this),
        $file = $upload.find('input[type=file]');
        this._s3Upload = s3UploadInit($upload, {
            s3: awsS3,
            type: $file.data('type') || 'file',
            Bucket: config.s3Bucket,
            removeBeforeChange: pubDlgAttrHasVar($file.attr('name'), 'fileext'),
            Key: function(action)
            {
                var title = $pubDlg.find('input[name=FolderName]').val(),
                file = uploadElEvalFilename(this, action);
                return appDir + '/' + title + '/' + file;
            },
            signExpires: function()
            {
                return awsExpireReverse(config.awsExpireReverseInHours);
            },
            onUploadSuccess: function()
            {
                pubDlgUpdated = true;
                uploadFileUpdateExtension(this);
                // this method should update file ui
                uploadFileUpdate($upload)
            },
            onRemoveSuccess: function()
            {
                pubDlgUpdated = true;
                uploadFileUpdateExtension(this);
                // this method should update file ui
                uploadFileUpdate($upload)
            },
            onFileExistCheck: function(exists)
            {
                if($(this).hasClass('paidfileupload'))
                {
                    $pubDlg.find('input[name=Type]').each(function()
                         {
                             if(exists)
                                 this.checked = (this.value == 'Paid');
                             else
                                 this.checked = (this.value != 'Paid');
                         });
                    pubDlgUpdateType();
                }
            },
            checkBeforeUpload: function(inp_el, file, cb)
            {
              makeImageFromFile(file, function(err, image)
                {
                  if(err)
                    return notifyUserError(err);
                  var m = validateImageSizeByElementAttrs(inp_el, image);
                  cb(!m);
                  if(m)
                    notifyUserError(m);
                });
            },
            onerror: handleAWSS3Error,
            loadnow: false
        });
    }
    var pubDlgUpdated;
    $pubDlg.on('hidden.bs.modal', function()
         {
             var pub = $pubDlg.data('pubObj');
             if(pubDlgUpdated)
             {
                 location.reload();
                 return;
             }
             // remove update info
             $pubDlg.data('pubObj', null)
                 .removeClass('update-pub-dlg')
                 .toggleClass('new-pub-dlg', true);
             $pubDlg.find('input[type=text]').each(function()
                {
                    $(this).val('');
                });
             $pubDlg.find('.fileinput').each(function()
                {
                    var $this = $(this);
                    $this.find('input[type=file]').val('');
                    $this.toggleClass('fileinput-new', true)
                        .removeClass('fileinput-exists');
                    $this.find('.fileinput-preview img').prop('src', '')
                        .remove();
                });
             
             asset_uploader.stop();
         });
    var illegalPubs = [ "AAD", "APP__", "APP_", "APP_", "APW_" ];
    $pubDlg.find('.set-title-btn').click(function()
         {
             var $this = $(this);
             if($this.data('isLoading') || !awsS3)
                 return false;
             var $title_inp = $pubDlg.find('input[name=FolderName]'),
             title_val = $title_inp.val();
             if(!title_val)
                 return false;
             if(illegalPubs.indexOf(title_val) >= 0)                
             {
                 notifyUserError(_('Invalid publication name!'));
                 return false;
             }
             $this.ladda({}).ladda('start').data('isLoading', true);
             $title_inp.prop('disabled', true);
             s3ObjectExists(awsS3, {
                 Bucket: config.s3Bucket,
                 Prefix: appDir + '/' + title_val + '/'
             }, function(err, exists)
                {
                    $this.ladda('stop').data('isLoading', false);
                    if(err)
                    {
                        handleAWSS3Error(err);
                        return;
                    }
                    if(!exists)
                    {
                        $(this).parent().hide();
                        $pubDlg.find('.pub-body-form').show();
                        if(s3AuthObj.type != 'idFed')
                            setPLUploadInfoForPub(title_val);
                    }
                    else
                    {
                        $title_inp.prop('disabled', false);
                        notifyUserError(_('Folder exists!'));
                    }
                });
             return false;
         });
    $pubDlg.on('show.bs.modal', function()
         {
             pubDlgUpdated = false;
             var pub = $pubDlg.data('pubObj'),
             type = 'Free';
             $pubDlg.find('.uufile').remove();
             $pubDlg.find('input[type=file]').prop('disabled', false);
             $pubDlg.find('.fileinput').each(function()
                   {
                       uploadFileUpdate($(this))
                   });
             if(pub)
             {
                 type = '';
                 var pub_name = pub.FileName;
                 $pubDlg.find('.set-title-btn').parent().hide();
                 $pubDlg.find('input[name=FolderName]').prop('disabled', true);
                 $pubDlg.find('.pub-body-form').show();
                 $pubDlg.find('.fileinput').each(function()
                    {
                      var $upload = $(this),
                      inp = $upload.find('input[type=file]')[0];
                      if(this._s3Upload)
                        this._s3Upload.reload();
                      if(inp)
                      {
                        // fileinput download-btn ready
                        $upload.find('.download-btn').each(function()
                          {
                            var title = 
                              $pubDlg.find('input[name=FolderName]').val(),
                            file = uploadElEvalFilename(inp),
                            a_tag = this;
                            awsS3.getSignedUrl('getObject', {
                              Bucket: config.s3Bucket,
                              Key: appDir + '/' + title + '/' + file,
                              Expires: awsExpireReverse(config.awsExpireReverseInHours)
                            }, function(err, url)
                               {
                                 a_tag.href = !err && url ? url : '';
                               })
                          });
                      }
                    });
                 if(s3AuthObj.type != 'idFed')
                     setPLUploadInfoForPub(pub_name);

                 // list uploaded elements and add them to list
                 var pubDir = appDir + '/' + pub_name + '/',
                 excluded_files = [
                     pub_name + (pub.free_ext || ''),
                     pub_name + '_' + (pub.paid_ext || ''),
                     pub_name + '.png',
                     pub_name + '_newsstand.png'
                 ];
                 s3ListAllObjects(awsS3, {
                     Bucket: config.s3Bucket,
                     Prefix: pubDir
                 }, function(err, res)
                    {
                        if(err)
                        {
                            handleAWSS3Error(err);
                            return;
                        }
                        var contents = res.Contents;
                        for(var i = 0, l = contents.length; i < l; ++i)
                        {
                            var key = contents[i].Key,
                            fn = key.substr(pubDir.length).replace('*', '\\*');
                            if(fn && excluded_files.indexOf(fn) == -1)
                                insertUploadItem(fn, { class_name: 'uufile' });
                        }
                    });
             }
            else
             {
                 $pubDlg.find('input[name=FolderName]').prop('disabled', false);
                 $pubDlg.find('.set-title-btn').parent().show();
                 $pubDlg.find('.pub-body-form').hide();
             }
             $pubDlg.find('input[name=Type]').each(function()
                 {
                     if(this.value == type)
                         this.checked = true;
                     else
                         this.checked = false;
                 });
             pubDlgUpdateType();
         });
    function pubDlgEvalAttr(s, vars)
    {
        s = s+'';
        vars = $.extend(false, getObjectOfForm($pubDlg), vars);
        for(var i in vars)
        {
            var name = '*'+i+'*',
            val = vars[i];
            for(var n = 0, idx; (idx = s.indexOf(name, n)) >= 0; 
                n = idx + name.length)
            {
                if(idx == 0 || s[idx-1] != '\\')
                    s = s.substr(0, idx) + val + s.substr(idx + name.length);
            }
        }
        return s.replace('\\*', '*');
    }
    function pubDlgAttrHasVar(s, vr)
    {
        var idx = s.indexOf('*'+vr+'*');
        return idx == 0 || (idx > 0 && s[idx-1] != '\\');
    }
    $pubDlg.find('input[name=Type]').on('change', pubDlgUpdateType);
    function pubDlgUpdateType()
    {
        var paid_elem = $pubDlg.find('.paid-elem'),
        paid_radio = $pubDlg.find('input[name=Type]').filter('[value=Paid]');
        if(paid_radio.prop('checked'))
            paid_elem.show();
        else
            paid_elem.hide();
    }
    var img_check_pttrn = /\.(jpe?g|png|gif)$/i;
    function insertUploadItem(key, opts)
    {
        opts = opts || {};
        var class_name = opts.class_name ? ' ' + opts.class_name : '',
        isImg = img_check_pttrn.test(key),
        uploadLI = $('<li class="list-group-item'+class_name+'">\
                <div class="form-group">\
                  <label class="control-label col-lg-2">' + key + '</label>\
                  <div class="clearfix"></div>\
                  <div class="col-lg-8">\
                    <div class="fileinput fileinput-new" \
                         data-provides="fileinput">' + 
            (isImg ? '<div class="fileinput-preview thumbnail" \
                           data-trigger="fileinput" \
                           style="width: 200px; height: 150px;"></div>' : '') +
				      '<div>\
				        <span class="btn btn-default btn-file"><span class="fileinput-new">'+_('Select file')+'</span><span class="fileinput-exists fileinput-change">'+_('Change')+'</span><input '+(isImg ? 'data-type="Image" ' : '')+'type="file" name="'+ key + '"></span>\
				        <a href="#" class="btn btn-default fileinput-exists fileinput-remove" data-dismiss="fileinput">'+_('Remove')+'</a>\
				      </div>\
			        </div>\
                  </div>\
                </div>\
              </li>').appendTo($pubDlg.find('.upload-list'));
        var el = uploadLI.find('.fileinput')[0];
        initUploadEl.call(el);
        if(el._s3Upload)
            el._s3Upload.reload();
    }

    
    function updatePubTable(callback)
    {
        s3ListAllObjects(awsS3, {
                Bucket: config.s3Bucket,
                Prefix: appDir + '/',
                Delimiter: '/'
            },
            function(error, apps) {

                awsS3.getObject({
                    Bucket: config.s3Bucket,
                    Key: appDir+'/Magazines.plist'
                }, function(err, activated) {
                    var appsList = apps.CommonPrefixes,
                    activeList;
                    try {
                        activeList = $.plist($.parseXML(activated.Body.toString()));
                    }catch(e) {
                        activeList = [];
                    }
                    var activeListLength = activeList.length;

                    var rowsList = [];
                    var temp = {};
                    var count = 0;

                    for(var i = 0; i < appsList.length; ++i) {

                        //---------------------------------------------------
                        // We have 3 unwanted folders...
                        // ignore them and don't show them on the list
                        //---------------------------------------------------

                        if (isolateFolderName(appsList[i].Prefix) == "AAD" ||
                            isolateFolderName(appsList[i].Prefix) == "APP__" ||
                            isolateFolderName(appsList[i].Prefix) == "APP_" ||
                            isolateFolderName(appsList[i].Prefix) == "APP_" ||
                            isolateFolderName(appsList[i].Prefix) == "APW_") {
                            continue;
                        }

                        //---------------------------------------------------
                        // Prepear a single row object with default value
                        //---------------------------------------------------

                        temp[count] = {
                            FileName: isolateFolderName(appsList[i].Prefix),
                            FolderName: isolateFolderName(appsList[i].Prefix),
                            Title: "",
                            Subtitle: "",
                            status: "inactive",
                            statusBtn: "<a data-filename='" + isolateFolderName(appsList[i].Prefix) + "' class='btn  btn-danger btn-xs text-center btnActive' href='#'>"+_("Inactive")+"</a>",
                            id: 0
                        }
                        for(var j = 0; j < activeListLength; ++j) {

                            //---------------------------------------------------
                            // There sometimes undefined keys is the object...
                            // it cause because of inactive publications...
                            // it's shouldn't happen, but we do taking
                            // care of it, so the front end user wont have any
                            // errors... jus in case...
                            //---------------------------------------------------

                            /*if (activeList[j] == undefined) {
                             continue;
                             }*/

                            //---------------------------------------------------
                            // Does the folder name fit each other?
                            // if so update this publication title, subtitle
                            // and status
                            //---------------------------------------------------

                            if (isolateFolderName2(activeList[j].FileName) == temp[count].FileName ||
                                isolateFolderName3(activeList[j].FileName) == temp[count].FileName) {
                                temp[count].Title = activeList[j].Title;
                                temp[count].Subtitle = activeList[j].Subtitle;
                                temp[count].status = "active";
                                temp[count].statusBtn = "<a data-filename='" + isolateFolderName(appsList[i].Prefix) + "' data-id='" + j + "' class='btn  btn-success btn-xs text-center btnInactive' href='#'>"+_("Active")+"</a>";
                                temp[count].id = j;
                                added = true;
                                break;
                            }
                        }

                        rowsList.push(temp[count]);
                        count++;
                    }
                    function getPubByRowId(id)
                    {
                        var pttrn = /row_([0-9]+)/,
                        match = pttrn.exec(id);
                        if(match)
                        {
                            var index = parseInt(match[1])
                            if(index >= 0)
                                return rowsList[index];
                        }
                    }
                    function pubTRClick()
                    {
                        var $this = $(this),
                        item = getPubByRowId(this.id);
                        if(!item)
                            return;
                        awsS3.listObjects({
                            Bucket: config.s3Bucket,
                            Prefix: appDir + '/' + item.FolderName + '/' +
                                item.FolderName
                        }, function(err, res)
                           {
                               if(err)
                               {
                                   handleAWSS3Error(err);
                                   return;
                               }
                               function getKeySub(item)
                               {
                                   return item.Key.substr(prefLen);
                               }
                               var prefLen = res.Prefix.length,
                               free = startsWith(res.Contents, '.', getKeySub),
                               paid = startsWith(res.Contents, '_.', getKeySub);
                               item = $.extend(false, {}, item);
                               
                               item.free_ext = free.length > 0 ? 
                                   free[0].Key.substr(prefLen) : null;
                               item.paid_ext = paid.length > 0 ? 
                                   paid[0].Key.substr(prefLen + 1) : null;
                               
                               $pubDlg.find('input[type=text]')
                                   .each(function()
                                    {
                                        var $this = $(this),
                                        name = $this.attr('name');
                                        for(var key in item)
                                            if(name == key)
                                        {
                                            $this.val(item[key]);
                                            break;
                                        }
                                    });
                               $pubDlg.data('pubObj', item)
                                   .removeClass('new-pub-dlg')
                                   .toggleClass('update-pub-dlg', true)
                                   .modal('show');
                           });
                        return false;
                    }
                    //---------------------------------------------------
                    // Add the rows to the table
                    //---------------------------------------------------

                    for(var i = 0; i < rowsList.length; ++i) {
                        addRowToTable(i, rowsList[i], publicationsTable);
                    }

                    //---------------------------------------------------
                    // Apply events for the active/inactive buttons
                    //---------------------------------------------------

                    
                    $pubTable.on('click', 'tbody > tr', pubTRClick)

                    callback && callback();
                });
            });
    }
    function isolateFolderName(name) {
        return name.replace(appDir + '/', "").replace("/", "");
    }

    function isolateFolderName2(name) {
        return name.substring(	name.indexOf("/")+1, name.length-5);
    }

    function isolateFolderName3(name) {
        return name.substring(	name.indexOf("/")+1, name.length-4);
    }

});

function formDisplay() {
    $("input[name='folderName']").bind("keyup", function() {
        $(".hiddenFields").show();
    });
}

function activeInactiveEvents(publicationsTable) {

    publicationsTable.on("click", "a.btnActive", {}, function(e) {
        e.preventDefault();
        var obj = $(this);
        activePublication(obj, publicationsTable);
        return false;
    });

    publicationsTable.on("click", "a.btnInactive", {}, function(e) {
        e.preventDefault();
        var obj = $(this);
        inactivePublication(obj, publicationsTable);
        return false;
    });
}

function activePublication(obj, publicationsTable) {
    var some_html = '<form class="form-horizontal"> <div class="form-group"> ' +
        '<label class="control-label col-lg-4">'+_('Title')+'</label> ' +
        '<div class="col-lg-8"> ' +
        '<input type="text" name="pubTitleInput" /> ' +
        '</div> ' +
        '</div>';
    some_html += '<div class="form-group"> ' +
        '<label class="control-label col-lg-4">'+_('Subtitle')+'</label> ' +
        '<div class="col-lg-8"> ' +
        '<input type="text" name="pubSubtitleInput" /> ' +
        '</div> ' +
        '</div></form>';

    bootbox.dialog({
        message: some_html,
        title: "Confirmation",
        className: "littleModal",
        buttons: {
            success: {
                label: "Confirm",
                className: "btn-success",
                callback: function() {
                    activeServerRequest(obj, publicationsTable);
                }
            },
            danger: {
                label: "Cancel",
                className: "btn-danger",
                callback: function() {}
            }
        }
    });
}

function inactivePublication(obj, publicationsTable) {
    bootbox.dialog({
        message: "Are you sure you want to inactive this publication?",
        title: "Confirmation",
        className: "littleModal",
        buttons: {
            success: {
                label: "Confirm",
                className: "btn-success",
                callback: function() {
                    inactiveServerRequest(obj, publicationsTable);
                }
            },
            danger: {
                label: "Cancel",
                className: "btn-danger",
                callback: function() {}
            }
        }
    });
}
function is_paid_pub(filename, cb)
{
  s3ObjectExists(awsS3, {
    Bucket: config.s3Bucket,
    Key: appDir + '/' + filename + '/' + filename + '_.pdf'
  }, cb);
}
function activeServerRequest(obj, publicationsTable) {
    
    var pTitle = $("input[name='pubTitleInput']").val();
    var pSubtitle = $("input[name='pubSubtitleInput']").val();

    awsS3.getObject({
        Bucket: window.config.s3Bucket,
        Key: appDir+'/Magazines.plist'
    }, function(err, activated) {

        //var activeList = PlistParser.parse($.parseXML(activated.Body.toString()));
        var activeList;
        try {
            activeList = $.plist($.parseXML(activated.Body.toString()));
        }catch(e) {
            activeList = [];
        }
        is_paid_pub(obj.data('filename'), function(err, is_paid)
          {
            if(err)
              return console.error(err);
            var pub = {
              FileName: obj.data("filename") + "/" + obj.data("filename") + 
                (is_paid ? '_' : '') + ".pdf",
              Title: pTitle,
              Subtitle: pSubtitle
            };
            insertPubInList(pub, activeList);
            
            var body = $.plist('toString', activeList);
        

            var params = {
              Bucket: window.config.s3Bucket, // required
              Key: appDir+'/Magazines.plist',
              //Body: PlistParser.toPlist(activeList)
              Body: body
            };
            window.awsS3.putObject(params, function(err, data) {
              if (err) {
                alert(Error);
              } else {
                //obj.addClass("btnInactive").addClass("btn-danger").removeClass("btnActive").removeClass("btn-success").html("Inactive").data("id", activeListLength);
                //publicationsTable.fnGetPosition( obj.parents('tr').closest('.ttitle')[0]).html(pTitle);
                //publicationsTable.fnGetPosition( obj.parents('tr').closest('.tsubtitle')[0]).html(pSubtitle);
                location.reload();
              }
            });
          });
    });
}

function inactiveServerRequest(obj, publicationsTable) {

    awsS3.getObject({
        Bucket: window.config.s3Bucket,
        Key: appDir+'/Magazines.plist'
    }, function(err, activated) {

        var tmp = obj.data('filename'),
        activeList;
        try {
            activeList = $.plist($.parseXML(activated.Body.toString()));
        }catch(e) {
            activeList = [];
        }
        is_paid_pub(tmp, function(err, is_paid)
          {
            if(err)
              return console.error(err);
            var filename = tmp + '/' + tmp + (is_paid ? '_' : '') + '.pdf';

            for(var i = 0; i < activeList.length; )
              if(activeList[i].FileName == filename)
                activeList.splice(i, 1);
              else
                i++;
        
            var body = $.plist('toString', activeList);
        
            //var rowIndex = publicationsTable.fnGetPosition( obj.closest('tr')[0] );
            //publicationsTable.fnDeleteRow(rowIndex);

            var params = {
              Bucket: window.config.s3Bucket, // required
              Key: appDir+'/Magazines.plist',
              //Body: PlistParser.toPlist(activeList)
              Body: cleanKeys($.plist('toString', activeList))
            };
            window.awsS3.putObject(params, function(err, data) {
              if (err) {
                alert(Error);
              } else {
                //obj.removeClass("btnInactive").removeClass("btn-danger").addClass("btnActive").addClass("btn-success").html("Active").data("id", 0);
                //publicationsTable.fnGetPosition( obj.parents('tr').closest('.ttitle')[0]).html("");
                //publicationsTable.fnGetPosition( obj.parents('tr').closest('.tsubtitle')[0]).html("");
                location.reload();
              }
            });
          });
    });
}

function addRowToTable(index, data, publicationsTable) {
    publicationsTable.fnAddData( {
        'DT_RowId': 'row_' + index,
        '0': data.FileName,
        '1': "<span class='ttitle'>" + data.Title + "</span>",
        '2': "<span class='tsubtitle'>" + data.Subtitle + "</span>",
        '3': data.statusBtn
    });
}


function deleteFromObject(obj, deleteValue) {
    var objToArray = $.map(obj, function(value, index) {
        return [value];
    });

    for (var i = 0; i < objToArray.length; ++i) {
        if (objToArray[i] == deleteValue) {
            objToArray.splice(i, 1);
            i--;
        }
    }

    return ArrayToObject(objToArray);
}

function ArrayToObject(arr) {
    var rv = {};
    for (var i = 0; i < arr.length; ++i)
        rv[i] = arr[i];
    return rv;
}

function cleanKeys(obj) {
    //return obj.replace("\<key\>\d+\<\/key\>\n\<dict\>", "<dict>");
    return obj.replace(/\n\<key\>\d+\<\/key\>\n\<dict\>/g, "\n<dict>");
}

function insertPubInList(pub, list)
{
    var pubfn = pub.FileName,
    replaced;
    // replace publications or add it
    for(var i = 0, l = list.length; i < l; ++i)
    {
        var item = list[i];
        if(item && item.FileName == pubfn)
        {
            list[i] = pub;
            replaced = true;
            break;
        }
    }
    if(!replaced)
    {
        list.push(pub);
        return true;
    }
}
