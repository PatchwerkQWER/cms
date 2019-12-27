NEWSCHEMA('Contacts', function(schema) {

	schema.define('firstname', 'Capitalize(40)', true);
	schema.define('lastname', 'Capitalize(40)', true);
	schema.define('email', 'Email', true);
	schema.define('body', String, true);
	schema.define('phone', 'Phone');

	schema.setSave(function($) {

		var model = $.model;
		model.id = UID();
		model.ip = $.ip;
		model.browser = $.res.useragent();
		model.dtcreated = NOW;

		var nosql = NOSQL('contactforms');
		nosql.insert(model.$clean());
		nosql.counter.hit('all');
		$.success();

		EMIT('contacts.save', model);

		// Sends email
		MAIL(PREF.emailcontactform, '@(Contact form)', '=?/mails/contact', model, $.language).reply(model.email, true);

		// Events
		$SAVE('Events', { type: 'contactforms/add', user: $.user ? $.user.name : '', body: model.firstname + ' ' + model.lastname, id: model.id }, NOOP, $);
	});

	// Stats
	schema.addWorkflow('stats', function($) {
		NOSQL('contactforms').counter.monthly('all', $.callback);
	});
});