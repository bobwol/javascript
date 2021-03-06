function url_origin(s)
{
  s = s || '';
  var pttrn = /https?:\/\/[^\/]+/,
  match = pttrn.exec(s);
  if(match)
    return match[0];
  match = pttrn.exec(document.location+'');
  if(match)
    return match[0];
  return '';
}
function path_without_query(s)
{
  s = s || '';
  var qstr = get_url_query(s),
  ret;
  if(qstr.length > 0)
    ret = s.substr(0, s.length - qstr.length - 1);
  else
    ret = s;
  return ret;
}
function librelio_url_query(s)
{
  var idx = (s+'').lastIndexOf('?');
  return idx == -1 ? '' : s.substr(idx+1);
}
function forEach(a, each_cb)
{
  for(var i = 0, l = a.length; i < l; ++i)
    each_cb(a[i], i);
}
function s3bucket_file_url(key)
{
  return '//' + config.s3Bucket + '.s3-eu-west-1.amazonaws.com' + 
    (key[0] == '/' ? '' : '/') + key;
}
function librelio_pdf_resolve_url(s, relto)
{
  function relpath(s)
  {
    var query = url('?', s),
    hash = url('#'),
    path_str = proto === null ? 
      path.join(url('hostname', s), url('path', s)) : url('path', s);
    return (path_str[0] == '/' ? path_str.substr(1) : path_str) +
      (query ? '?' + query : '') + (hash ? '#' + hash : '');
  }
  var hostname = url('hostname', s),
  protos = [ 'http:', 'https:', '' ],
  proto = url_protocol(s);
  if((hostname == 'localhost' && protos.indexOf(proto) != -1) || proto === null)
    return (relto ? relto + '/' : '') + relpath(s);
  return s;
}
function url_protocol(s)
{
  var pttrn = /^(\w+:)\/\//,
  match = pttrn.exec(s);
  return match ? match[1] : (s.substr(0, 2) == '//' ? '' : null);
}
function url_till_hostname(s)
{
  var proto = url_protocol(s),
  hostname = url('hostname', s),
  auth = url('auth', s);
  if(proto === null)
    return '';
  else
    return proto + '//' + (auth ? auth + '@' : '') + url('hostname', s);
}
function url_dir(s)
{
  var url_str = url_till_hostname(s),
  dirname = path.dirname(url_str === '' ? s : url('path', s));
  return url_str + (!url_str || dirname[0] == '/' ? '' : '/') + dirname;
}
function url_path_plus(url_str)
{
  var query_str = url('?', url_str),
  hash_str = url('#', url_str);
  return url('path', url_str) + (query_str ? '?' + query_str : '') + 
    (hash_str ? '#' + hash_str : '');
}
function get_url_query(url)
{
  url = url+'';
  var idx = url.indexOf('?'),
  idx2 = url.indexOf('#');
  return idx == -1 ? '' : 
    (idx2 == -1 ? url.substr(idx + 1) : url.substring(idx + 1, idx2));
}
function wrpFunc(func, thisarg, prepend_args, append_args)
{
  var arraySlice = Array.prototype.slice;
  return function()
  {
    var args = arraySlice.call(arguments);
    return func.apply(thisarg || this, 
                 prepend_args ? prepend_args.concat(args, append_args) :
                                args.concat(append_args));
  }
}
function funcListCall(a)
{
  for(var i = 0, l = a.length; i < l; ++i)
  {
    var item = a[i];
    item[1].apply(item[0], item.slice(2));
  }
}
function on(el, releaser)
{
  var arraySlice = Array.prototype.slice;
  el.on.apply(el, arraySlice.call(arguments, 2));
  if(releaser)
    releaser.push(([ el, el.off ]).concat(arraySlice.call(arguments, 2)));
  return wrpFunc(arguments.callee, null, [ el, releaser ]);
}
function PDFExtendXMLData(data)
{
  var xmlDoc = $.parseXML(data),
  $xml = $(xmlDoc),
  res = {
    pages: []
  };
  $xml.find('Page').each(function()
    {
      var $page = $(this),
      page_index = $page.attr('index');
      if(page_index >= 0)
      {
        var page = res.pages[page_index] = {
          annotations: []
        };
        $page.find('Annotations > Annotation').each(function()
          {
            var $annot = $(this),
            data = {
              subtype: $annot.attr('subtype'),
              rect: $.map($annot.attr('rect').split(','), parseFloat)
            },
            id = $annot.attr('id');
            if(id)
              data.id = id;
            switch(data.subtype)
            {
            case 'Link':
              data.linktype = $annot.attr('linktype');
              data.value = $annot.attr('value');
              if(data.linktype == 'url')
                data.url = data.value;
              break;
            }
            page.annotations.push(data);
          });
      }
    });
  return res;
}
