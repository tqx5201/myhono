//定义数据在哪里显示
var my_data_area = '';
if (my_data_area == 'ace') {
  $('#my_data_area').html('<div id="data" style="height: 500px; width: 100%"></div>');
  var editor = ace.edit("data");
  editor.setTheme("ace/theme/monokai"); // 设置主题
  editor.setFontSize(16);
  editor.getSession().setMode("ace/mode/text"); // 设置语言模式
  editor.getSession().setUseWrapMode(true); //设置代码自动换行
  editor.getSession().on("change", function(e) {
    console.log("Editor content changed:", e);
  });
} else {
  $('#my_data_area').html('<textarea id="data" rows="20" class="form-control" style="heigth:500px;"></textarea>');
}



var yys = getUrlParam("yys");
if (yys === null) {
  yys = 'yd';
}
set_css(yys);


var api_url = 'api?';
var file_name = '';
var file_path = '';
//class="active"
get_categorys();


function getUrlParam(name) {
  var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)");
  var r = window.location.search.substr(1).match(reg);
  if (r !== null)
    return unescape(r[2]);
  return null;
}



function get_categorys() {
  $.ajax({
    url: api_url + "action=categorys",
    type: "post",
    dataType: "json",
    data: {
      yys: yys,
      data: $('#data').val(),
    },
    success: function(json) {
      //console.log(json);
      if (!$.isEmptyObject(json)) {
        $_html = '';
        $.each(json.data, function(i, item) {
          $_html += '<li class="list-group-item"><a href="#" onclick="read(\'' + item.name + '\')">' + item.name + '</a></li>';
        });
        $('.list-group').html($_html);
        read(json['data'][0]['name']);
      } else {
        $('.list-group').html("");
        $("#name").val("新分类");
        $("#data").val("暂无数据");
      }
    },
    error: function() {
      alert("错误");
    }
  });
}



function read(_name) {
  file_name = _name;
  $("#name").val(_name);
  $.ajax({
    url: api_url + "action=read",
    type: "post",
    data: {
      yys: yys,
      file: file_name,
    },
    dataType: "json",
    success: function(json) {
      //console.log(json);
      if (my_data_area == 'ace') {
        editor.setValue(json.data, -1);
        editor.clearSelection();
        editor.setShowPrintMargin(false);
      } else {
        $("#data").val(json.data);
      }
    },
    error: function() {
      alert("错误");
    }
  });
}

$("#save").click(function() {
  if (my_data_area == 'ace') {
    my_data = editor.getValue();
  } else {
    my_data = $('#data').val();
  }
  $.ajax({
    url: api_url + "action=save",
    type: "post",
    dataType: "json",
    data: {
      yys: yys,
      old_name: file_name,
      new_name: $("#name").val(),
      data: my_data,
    },
    success: function(json) {
      //console.log(json);
      alert(json.msg);
    },
    error: function() {
      alert("错误");
    }
  });
  get_categorys();
});


$("#del").click(function() {
  $.ajax({
    url: api_url + "action=del",
    type: "post",
    dataType: "json",
    data: {
      yys: yys,
      file: file_name,
    },
    success: function(json) {
      //console.log(json);
      alert(json.msg);
    },
    error: function() {
      alert("错误");
    }
  });
  get_categorys();
});

function set_css(id) {
  $("#yd").removeClass("active");
  $("#dx").removeClass("active");
  $("#lt").removeClass("active");
  $("#ty").removeClass("active");
  $("#" + id).addClass("active");
}

$("#add_new").click(function() {
  file_name = 'null';
  $("#name").val("新分类");
  $("#data").val("");
});

$("#up_qiniu").click(function() {
  $.ajax({
    url: api_url + "action=up_qiniu",
    type: "post",
    dataType: "json",
    data: {
      yys: yys,
    },
    success: function(json) {
      alert(json.msg);
    },
    error: function() {
      alert("错误");
    }
  });
});
$("#merge_list").click(function() {
  $.ajax({
    url: api_url + "action=merge_list",
    type: "post",
    dataType: "json",
    data: {
      yys: yys,
    },
    success: function(json) {
      alert(json.msg);
    },
    error: function() {
      alert("错误");
    }
  });
});


function replaceText() {
  var findText = $('#find').val();
  var replaceText = $('#replace').val();
  if (my_data_area == 'ace') {
    editor.find(findText, {
      backwards: false,
      wrap: false,
      caseSensitive: false,
      wholeWord: false,
      regExp: false
    });
    editor.findAll();
    editor.replaceAll(replaceText);
  } else {
    var originalText = document.getElementById('data').value;
    var modifiedText = originalText.replace(new RegExp(findText, 'g'), replaceText);
    //console.log(modifiedText);
    document.getElementById('data').value = modifiedText;
  }
}




/**
 * 解析文本为映射对象（去空格、兼容中文逗号）
 * @param {string} text - 输入文本
 * @returns {Object} 键：简体名，值：繁体名/地址
 */
function parseText(text) {
  const map = {};
  text.split('\n').forEach(line => {
    const [key, val] = line.trim().replace(/，/g, ',').split(',').map(item => item.trim());
    if (key && val) map[key] = val;
  });
  return map;
}

/**
 * 匹配核心：精准优先 → 补/删「台」字兜底
 * @param {string} targetName - 待匹配简体名
 * @param {Object} zh2Ft - 繁简对照映射
 * @returns {string|undefined} 匹配到的繁体名
 */
function matchWithFallback(targetName, zh2Ft) {
  // 1. 精准匹配
  if (zh2Ft[targetName]) return zh2Ft[targetName];
  // 2. 补/删「台」字二次匹配
  const hasTai = targetName.endsWith('台');
  const newName = hasTai ? targetName.slice(0, -1) : `${targetName}台`;
  return zh2Ft[newName];
}




function zh2tw() {
  let my_data = '';
  // 1. 获取源数据（兼容ace编辑器/普通input，保留原始内容）
  if (typeof my_data_area !== 'undefined' && my_data_area === 'ace') {
    my_data = editor?.getValue() || '';
  } else {
    my_data = $('#data').val() || '';
  }
  // 空数据校验
  if (!my_data.trim()) {
    alert('请先输入「简体名,地址」格式的频道数据');
    return;
  }
  const originalLines = my_data.split('\n'); // 按行拆分，保留空行/顺序

  // 2. AJAX请求繁简对照文件
  console.log(`正在请求繁简对照文件`);
  $.ajax({
    url: "channel_zh_tw.txt",
    type: "get",
    dataType: "text",
    timeout: 5000, // 5秒超时
    success: function(zhFtText) {
      const zh2Ft = parseText(zhFtText);
      const resultLines = [];
      const noMatch = [];

      // 3. 逐行处理：匹配则替换为【繁体名,地址】，不匹配保留原行
      originalLines.forEach(line => {
        const trimedLine = line.trim().replace(/，/g, ',');
        // 空行直接保留
        if (!trimedLine) {
          resultLines.push(line);
          return;
        }
        // 拆分简体名和地址，校验格式
        const [zhName, url] = trimedLine.split(',').map(item => item.trim());
        if (!zhName || !url) {
          resultLines.push(line);
          noMatch.push(zhName || '格式错误行');
          return;
        }

        // 4. 匹配成功→输出【繁体名,地址】，失败→保留原行
        const ftName = matchWithFallback(zhName, zh2Ft);
        if (ftName) {
          resultLines.push(`${ftName},${url}`); // 核心：仅繁体名+地址
        } else {
          resultLines.push(line);
          noMatch.push(zhName);
        }
      });

      // 5. 结果回显（替换原#data内容）
      const finalResult = resultLines.join('\n');
      $("#data").val(finalResult);
      console.log('✅ 转换完成！结果：\n' + finalResult);

      // 6. 友好提示
      const successCount = resultLines.filter(l => {
        const trim = l.trim();
        return trim && !originalLines.includes(trim) && trim.split(',').length === 2;
      }).length;
      const uniqueNoMatch = [...new Set(noMatch)].filter(Boolean);
      if (uniqueNoMatch.length) {
        alert(`转换完成！成功${successCount}条，无匹配${uniqueNoMatch.length}条（详见控制台）`);
        console.log('❌ 无匹配/格式错误的频道：\n' + uniqueNoMatch.join('\n'));
      } else {
        alert(`转换完成！全部${successCount}条均成功转换`);
      }
    },
    error: function(xhr, status, err) {
      console.error('❌ 请求繁简对照文件失败：', status, err);
      alert(`请求失败！\n状态：${status}\n请检查接口地址/网络`);
    }
  });
}


