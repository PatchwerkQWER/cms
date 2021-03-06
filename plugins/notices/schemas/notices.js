NEWSCHEMA('Notices', function(schema) {

	schema.define('id', UID);
	schema.define('category', 'String(50)', true);
	schema.define('name', 'String(200)', true);
	schema.define('author', 'String(30)', true);
	schema.define('body', String, true);
	schema.define('date', Date);
	schema.define('event', Date);
	schema.define('icon', 'Lower(40)');
	schema.define('ispinned', Boolean);
	schema.define('url', 'String(500)');

	// Gets listing
	schema.setQuery(function($) {

		var opt = $.options === EMPTYOBJECT ? $.query : $.options;
		var isAdmin = $.controller ? $.controller.name === 'admin' : false;
		var filter = NOSQL('notices').list();

		filter.paginate(opt.page, opt.limit, 70);

		if (isAdmin) {
			opt.author && filter.gridfilter('author', opt, String);
			opt.name && filter.gridfilter('name', opt, String);
			opt.category && filter.gridfilter('category', opt, String);
		} else {
			opt.author && filter.where('author', opt.author);
			opt.category && filter.where('categoryid', opt.category);
			opt.published && filter.where('date', '<=', NOW);
			opt.search && filter.like('search', opt.search.keywords(true, true));
			opt.ispinned != null && filter.where('ispinned', opt.ispinned);
			opt.event && filter.where('event', '>', NOW.add('-1 day'));
			filter.fields('body');
		}

		filter.fields('id,categoryid,category,date,name,author,icon,dtcreated,ispinned,event,url,dtupdated');
		filter.gridsort(opt.sort || 'dtcreated_desc');

		filter.callback(function(err, response) {
			!isAdmin && prepare_body(response.items);
			$.callback(response);
		});
	});

	// Gets a specific post
	schema.setGet(function($) {
		var options = $.options;
		var filter = NOSQL('notices').one();
		var id = options.id || $.id;
		filter.where('id', id);
		filter.callback($.callback, 'error-notices-404');
		FUNC.alert($.user, 'notices/edit', id);
	});

	// Removes a specific post
	schema.setRemove(function($) {
		var id = $.body.id;
		var user = $.user.name;
		NOSQL('notices').remove().backup(user).log('Remove: ' + id, user).where('id', id).callback(function() {
			F.cache.removeAll('cachecms');
			$.success();
		});
	});

	schema.addWorkflow('preview', function($) {
		$.callback($.options.markdown());
	});

	// Saves the post into the database
	schema.setSave(function($) {

		var model = $.model.$clean();
		var user = $.user.name;
		var isUpdate = !!model.id;
		var nosql = NOSQL('notices');

		if (isUpdate) {
			model.dtupdated = NOW;
			model.adminupdated = user;
		} else {
			model.id = UID();
			model.admincreated = user;
			model.dtcreated = NOW;
		}

		!model.date && (model.date = NOW);
		model.search = ((model.name || '') + ' ' + (model.body || '')).keywords(true, true).join(' ').max(1000);
		model.linker_category = model.category.slug();

		var db = isUpdate ? nosql.modify(model).where('id', model.id).backup(user).log('Update: ' + model.id, user) : nosql.insert(model).log('Create: ' + model.id, user);

		db.callback(function() {
			$SAVE('Events', { type: 'notices/save', id: model.id, user: user, body: model.name, admin: true }, NOOP, $);
			EMIT('notices.save', model);
			F.cache.removeAll('cachecms');
			var category = PREF.notices.findItem('name', model.category);
			if (category)
				$.success();
			else
				refresh($.done());
		});

	});

	// Clears database
	schema.addWorkflow('clear', function($) {
		var user = $.user.name;
		NOSQL('notices').remove().backup(user).log('Clear all notices', user).callback(() => refresh($.done()));
	});
});

function refresh(callback) {
	NOSQL('notices').scalar('group', 'category').callback(function(err, response) {

		if (response) {
			var keys = Object.keys(response);
			var arr = [];
			keys.quicksort();
			for (var i = 0; i < keys.length; i++)
				arr.push({ id: keys[i].slug(), name: keys[i] });
			PREF.set('notices', arr);
		}

		callback && callback();
	});
}

function prepare_body(items) {
	for (var i = 0, length = items.length; i < length; i++) {
		var item = items[i];
		item.body = item.body.markdown().CMSglobals();
	}
}

/*! Markdown | (c) 2019 Peter Sirka | www.petersirka.com */
(function Markdown() {

	var keywords = /\{.*?\}\(.*?\)/g;
	var linksexternal = /(https|http):\/\//;
	var format = /__.*?__|_.*?_|\*\*.*?\*\*|\*.*?\*|~~.*?~~|~.*?~/g;
	var ordered = /^[a-z|0-9]{1}\.\s|^-\s/i;
	var orderedsize = /^(\s|\t)+/;
	var code = /`.*?`/g;
	var encodetags = /<|>/g;
	var regdash = /-{2,}/g;
	var regicons = /(^|[^\w]):[a-z-]+:([^\w]|$)/g;
	var regemptychar = /\s|\W/;

	var encode = function(val) {
		return '&' + (val === '<' ? 'lt' : 'gt') + ';';
	};

	function markdown_code(value) {
		return '<code>' + value.substring(1, value.length - 1) + '</code>';
	}

	function markdown_imagelinks(value) {
		var end = value.lastIndexOf(')') + 1;
		var img = value.substring(0, end);
		var url = value.substring(end + 2, value.length - 1);
		var label = markdown_links(img);
		var footnote = label.substring(0, 13);

		if (footnote === '<sup data-id=' || footnote === '<span data-id' || label.substring(0, 9) === '<a href="')
			return label;

		return '<a href="' + url + '"' + (linksexternal.test(url) ? ' target="_blank"' : '') + '>' + label + '</a>';
	}

	function markdown_table(value, align, ishead) {

		var columns = value.substring(1, value.length - 1).split('|');
		var builder = '';

		for (var i = 0; i < columns.length; i++) {
			var column = columns[i].trim();
			if (column.charAt(0) == '-')
				continue;
			var a = align[i];
			builder += '<' + (ishead ? 'th' : 'td') + (a && a !== 'left' ? (' class="' + a + '"') : '') + '>' + column + '</' + (ishead ? 'th' : 'td') + '>';
		}

		return '<tr>' + builder + '</tr>';
	}

	function markdown_links(value) {
		var end = value.lastIndexOf(']');
		var img = value.charAt(0) === '!';
		var text = value.substring(img ? 2 : 1, end);
		var link = value.substring(end + 2, value.length - 1);

		if ((/^#\d+$/).test(link)) {
			// footnotes
			return (/^\d+$/).test(text) ? '<sup data-id="{0}" class="footnote">{1}</sup>'.format(link.substring(1), text) : '<span data-id="{0}" class="footnote">{1}</span>'.format(link.substring(1), text);
		}

		var nofollow = link.charAt(0) === '@' ? ' rel="nofollow"' : linksexternal.test(link) ? ' target="_blank"' : '';
		return '<a href="' + link + '"' + nofollow + '>' + text + '</a>';
	}

	function markdown_image(value) {

		var end = value.lastIndexOf(']');
		var text = value.substring(2, end);
		var link = value.substring(end + 2, value.length - 1);
		var responsive = 1;
		var f = text.charAt(0);

		if (f === '+') {
			responsive = 2;
			text = text.substring(1);
		} else if (f === '-') {
			// gallery
			responsive = 3;
			text = text.substring(1);
		}

		return '<img src="' + link + '" alt="' + text + '"' + (responsive === 1 ? ' class="img-responsive"' : responsive === 3 ? ' class="gallery"' : '') + ' border="0" loading="lazy" />';
	}

	function markdown_keywords(value) {
		var keyword = value.substring(1, value.indexOf('}'));
		var type = value.substring(value.lastIndexOf('(') + 1, value.lastIndexOf(')'));
		return '<span class="keyword" data-type="{0}">{1}</span>'.format(type, keyword);
	}

	function markdown_links2(value) {
		value = value.substring(4, value.length - 4);
		return '<a href="' + (value.indexOf('@') !== -1 ? 'mailto:' : linksexternal.test(value) ? '' : 'http://') + value + '" target="_blank">' + value + '</a>';
	}

	function markdown_format(value, index, text) {

		var p = text.charAt(index - 1);
		var n = text.charAt(index + value.length);

		if ((!p || regemptychar.test(p)) && (!n || regemptychar.test(n))) {

			var beg = '';
			var end = '';
			var tag;

			if (value.indexOf('*') !== -1) {
				tag = value.indexOf('**') === -1 ? 'em' : 'strong';
				beg += '<' + tag + '>';
				end = '</' + tag + '>' + end;
			}

			if (value.indexOf('_') !== -1) {
				tag = value.indexOf('__') === -1 ? 'u' : 'b';
				beg += '<' + tag + '>';
				end = '</' + tag + '>' + end;
			}

			if (value.indexOf('~') !== -1) {
				beg += '<strike>';
				end = '</strike>' + end;
			}

			var count = value.charAt(1) === value.charAt(0) ? 2 : 1;
			return beg + value.substring(count, value.length - count) + end;
		}

		return value;
	}

	function markdown_id(value) {

		var end = '';
		var beg = '';

		if (value.charAt(0) === '<')
			beg = '-';

		if (value.charAt(value.length - 1) === '>')
			end = '-';

		// return (beg + value.replace(regtags, '').toLowerCase().replace(regid, '-') + end).replace(regdash, '-');
		return (beg + value.slug() + end).replace(regdash, '-');
	}

	function markdown_icon(value) {

		var beg = -1;
		var end = -1;

		for (var i = 0; i < value.length; i++) {
			var code = value.charCodeAt(i);
			if (code === 58) {
				if (beg === -1)
					beg = i + 1;
				else
					end = i;
			}
		}

		return value.substring(0, beg - 1) + '<i class="fa fa-' + value.substring(beg, end) + '"></i>' + value.substring(end + 1);
	}

	function markdown_urlify(str) {
		return str.replace(/(^|\s)+(((https?:\/\/)|(www\.))[^\s]+)/g, function(url, b, c) {
			var len = url.length;
			var l = url.charAt(len - 1);
			var f = url.charAt(0);
			if (l === '.' || l === ',')
				url = url.substring(0, len - 1);
			else
				l = '';
			url = (c === 'www.' ? 'http://' + url : url).trim();
			return (f.charCodeAt(0) < 40 ? f : '') + '[' + url + '](' + url + ')' + l;
		});
	}

	String.prototype.markdown = function(opt) {

		// opt.wrap = true;
		// opt.linetag = 'p';
		// opt.ul = true;
		// opt.code = true;
		// opt.images = true;
		// opt.links = true;
		// opt.formatting = true;
		// opt.icons = true;
		// opt.tables = true;
		// opt.br = true;
		// opt.headlines = true;
		// opt.hr = true;
		// opt.blockquotes = true;
		// opt.sections = true;
		// opt.custom
		// opt.footnotes = true;
		// opt.urlify = true;
		// opt.keywords = true;

		var str = this;

		if (!opt)
			opt = {};

		var lines = str.split('\n');
		var builder = [];
		var ul = [];
		var table = false;
		var iscode = false;
		var ishead = false;
		var prev;
		var prevsize = 0;
		var tmp;

		if (opt.wrap == null)
			opt.wrap = true;

		if (opt.linetag == null)
			opt.linetag = 'p';

		var closeul = function() {
			while (ul.length) {
				var text = ul.pop();
				builder.push('</' + text + '>');
			}
		};

		var formatlinks = function(val) {
			return markdown_links(val, opt.images);
		};

		var linkscope = function(val, index, callback) {

			var beg = -1;
			var beg2 = -1;
			var can = false;
			var n;

			for (var i = index; i < val.length; i++) {
				var c = val.charAt(i);

				if (c === '[') {
					beg = i;
					can = false;
					continue;
				}

				var il = val.substring(i, i + 4);

				if (il === '&lt;') {
					beg2 = i;
					continue;
				} else if (beg2 > -1 && il === '&gt;') {
					callback(val.substring(beg2, i + 4), true);
					beg2 = -1;
					continue;
				}

				if (c === ']') {

					can = false;

					if (beg === -1)
						continue;

					n = val.charAt(i + 1);

					// maybe a link mistake
					if (n === ' ')
						n = val.charAt(i + 2);

					// maybe a link
					can = n === '(';
				}

				if (beg > -1 && can && c === ')') {
					n = val.charAt(beg - 1);
					callback(val.substring(beg - (n === '!' ? 1 : 0), i + 1));
					can = false;
					beg = -1;
				}
			}

		};

		var imagescope = function(val) {

			var beg = -1;
			var can = false;
			var n;

			for (var i = 0; i < val.length; i++) {
				var c = val.charAt(i);

				if (c === '[') {
					beg = i;
					can = false;
					continue;
				}

				if (c === ']') {

					can = false;

					if (beg === -1)
						continue;

					n = val.charAt(i + 1);

					// maybe a link mistake
					if (n === ' ')
						n = val.charAt(i + 2);

					// maybe a link
					can = n === '(';
				}

				if (beg > -1 && can && c === ')') {
					n = val.charAt(beg - 1);
					var tmp = val.substring(beg - (n === '!' ? 1 : 0), i + 1);
					if (tmp.charAt(0) === '!')
						val = val.replace(tmp, markdown_image(tmp));
					can = false;
					beg = -1;
				}
			}


			return val;
		};

		for (var i = 0, length = lines.length; i < length; i++) {

			lines[i] = lines[i].replace(encodetags, encode);

			if (lines[i].substring(0, 3) === '```') {

				if (iscode) {
					if (opt.code !== false)
						builder.push('</code></pre></div>');
					iscode = false;
					continue;
				}

				closeul();
				iscode = true;
				if (opt.code !== false)
					tmp = '<div class="code hidden"><pre><code class="lang-' + lines[i].substring(3) + '">';
				prev = 'code';
				continue;
			}

			if (iscode) {
				if (opt.code !== false)
					builder.push(tmp + lines[i]);
				if (tmp)
					tmp = '';
				continue;
			}

			var line = lines[i];

			if (opt.urlify !== false && opt.links !== false)
				line = markdown_urlify(line);

			if (opt.custom)
				line = opt.custom(line);

			if (opt.formatting !== false)
				line = line.replace(format, markdown_format).replace(code, markdown_code);

			if (opt.images !== false)
				line = imagescope(line);

			if (opt.links !== false) {
				linkscope(line, 0, function(text, inline) {
					if (inline)
						line = line.replace(text, markdown_links2);
					else if (opt.images !== false)
						line = line.replace(text, markdown_imagelinks);
					else
						line = line.replace(text, formatlinks);
				});
			}

			if (opt.keywords !== false)
				line = line.replace(keywords, markdown_keywords);

			if (opt.icons !== false)
				line = line.replace(regicons, markdown_icon);

			if (!line) {
				if (table) {
					table = null;
					if (opt.tables !== false)
						builder.push('</tbody></table>');
				}
			}

			if (line === '' && lines[i - 1] === '') {
				closeul();
				if (opt.br !== false)
					builder.push('<br />');
				prev = 'br';
				continue;
			}

			if (line[0] === '|') {
				closeul();
				if (!table) {
					var next = lines[i + 1];
					if (next[0] === '|') {
						table = [];
						var columns = next.substring(1, next.length - 1).split('|');
						for (var j = 0; j < columns.length; j++) {
							var column = columns[j].trim();
							var align = 'left';
							if (column.charAt(column.length - 1) === ':')
								align = column[0] === ':' ? 'center' : 'right';
							table.push(align);
						}
						if (opt.tables !== false)
							builder.push('<table class="table table-bordered"><thead>');
						prev = 'table';
						ishead = true;
						i++;
					} else
						continue;
				}

				if (opt.tables !== false) {
					if (ishead)
						builder.push(markdown_table(line, table, true) + '</thead><tbody>');
					else
						builder.push(markdown_table(line, table));
				}
				ishead = false;
				continue;
			}

			if (line.charAt(0) === '#') {

				closeul();

				if (line.substring(0, 2) === '# ') {
					tmp = line.substring(2).trim();
					if (opt.headlines !== false)
						builder.push('<h1 id="' + markdown_id(tmp) + '">' + tmp + '</h1>');
					prev = '#';
					continue;
				}

				if (line.substring(0, 3) === '## ') {
					tmp = line.substring(3).trim();
					if (opt.headlines !== false)
						builder.push('<h2 id="' + markdown_id(tmp) + '">' + tmp + '</h2>');
					prev = '##';
					continue;
				}

				if (line.substring(0, 4) === '### ') {
					tmp = line.substring(4).trim();
					if (opt.headlines !== false)
						builder.push('<h3 id="' + markdown_id(tmp) + '">' + tmp + '</h3>');
					prev = '###';
					continue;
				}

				if (line.substring(0, 5) === '#### ') {
					tmp = line.substring(5).trim();
					if (opt.headlines !== false)
						builder.push('<h4 id="' + markdown_id(tmp) + '">' + tmp + '</h4>');
					prev = '####';
					continue;
				}

				if (line.substring(0, 6) === '##### ') {
					tmp = line.substring(6).trim();
					if (opt.headlines !== false)
						builder.push('<h5 id="' + markdown_id(tmp) + '">' + tmp + '</h5>');
					prev = '#####';
					continue;
				}
			}

			tmp = line.substring(0, 3);

			if (tmp === '---' || tmp === '***') {
				prev = 'hr';
				if (opt.hr !== false)
					builder.push('<hr class="line' + (tmp.charAt(0) === '-' ? '1' : '2') + '" />');
				continue;
			}

			// footnotes
			if ((/^#\d+:(\s)+/).test(line)) {
				if (opt.footnotes !== false) {
					tmp = line.indexOf(':');
					builder.push('<div class="footnotebody" data-id="{0}"><span>{0}:</span> {1}</div>'.format(line.substring(1, tmp).trim(), line.substring(tmp + 1).trim()));
				}
				continue;
			}

			if (line.substring(0, 5) === '&gt; ') {
				if (opt.blockquotes !== false)
					builder.push('<blockquote>' + line.substring(5).trim() + '</blockquote>');
				prev = '>';
				continue;
			}

			if (line.substring(0, 5) === '&lt; ') {
				if (opt.sections !== false)
					builder.push('<section>' + line.substring(5).trim() + '</section>');
				prev = '<';
				continue;
			}

			var tmpline = line.trim();

			if (opt.ul !== false && ordered.test(tmpline)) {

				var size = line.match(orderedsize);
				if (size)
					size = size[0].length;
				else
					size = 0;

				var append = false;

				if (prevsize !== size) {
					// NESTED
					if (size > prevsize) {
						prevsize = size;
						append = true;
						var index = builder.length - 1;
						builder[index] = builder[index].substring(0, builder[index].length - 5);
						prev = '';
					} else {
						// back to normal
						prevsize = size;
						builder.push('</' + ul.pop() + '>');
					}
				}

				var type = tmpline.charAt(0) === '-' ? 'ul' : 'ol';
				if (prev !== type) {
					var subtype;
					if (type === 'ol')
						subtype = tmpline.charAt(0);
					builder.push('<' + type + (subtype ? (' type="' + subtype + '"') : '') + '>');
					ul.push(type + (append ? '></li' : ''));
					prev = type;
					prevsize = size;
				}

				builder.push('<li>' + (type === 'ol' ? tmpline.substring(tmpline.indexOf('.') + 1) : tmpline.substring(2)).trim().replace(/\[x\]/g, '<i class="fa fa-check-square green"></i>').replace(/\[\s\]/g, '<i class="far fa-square"></i>') + '</li>');

			} else {
				closeul();
				line && builder.push((opt.linetag ? ('<' + opt.linetag + '>') : '') + line.trim() + (opt.linetag ? ('</' + opt.linetag + '>') : ''));
				prev = 'p';
			}
		}

		closeul();
		table && opt.tables !== false && builder.push('</tbody></table>');
		iscode && opt.code !== false && builder.push('</code></pre>');
		return (opt.wrap ? '<div class="markdown">' : '') + builder.join('\n').replace(/\t/g, '    ') + (opt.wrap ? '</div>' : '');
	};

})();

refresh();