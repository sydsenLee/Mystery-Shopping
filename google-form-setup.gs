/**
 * Mystery Shopping: creates the Google Form for delegates, plus a Google Sheet for the answers.
 *
 * HOW TO USE (about 3 minutes, one time only)
 * 1. Go to https://script.google.com and click "New project".
 * 2. Delete what is there, paste this whole file in, and click Save.
 * 3. Click Run. Google asks for permission the first time: click "Review permissions",
 *    choose your account, then "Allow". (If you see "Google hasn't verified this app",
 *    click "Advanced" and then "Go to project". It is your own script.)
 * 4. Open "Execution log" at the bottom. It shows three links:
 *      - the form link to send to delegates
 *      - the link to edit the form
 *      - the Google Sheet where answers arrive
 *
 * The question wording matches the Mystery Shopping app exactly, so the app can import
 * the answers straight from the Sheet. If you change a question here, change it in the
 * app too (Edit questions), or that question will not import.
 */

var QUESTIONS = [
  "# First Moment of Truth",
  "Was there point of sale material on display?",
  "Was the showroom clean and tidy?",
  "Were you acknowledged within 30 seconds?",
  "Were you served within 3 minutes?",
  "Did the salesperson wear a name badge?",
  "Did the salesperson stand up and greet you?",
  "Did the salesperson introduce themselves?",
  "Did they offer assistance / determine the reason for your visit?",
  "Did they use your name during discussions?",
  "Did they provide you with a business card?",
  "Did they offer refreshments?",
  "Did they provide correct information timeously?",
  "Did they refrain from taking calls?",
  "Did they record your name?",
  "Did they record your contact number?",
  "Did they record your e-mail address?",
  "Did they avoid opening with \"Can I help you?\"",
  "# Second Moment of Truth",
  "Did the salesperson qualify your needs?",
  "Did they ask what you currently drive?",
  "Did they ask why you bought your current vehicle?",
  "Did they ask why you are looking to change?",
  "Did they establish your budget?",
  "Did they ask questions to determine your customer profile?",
  "Did they establish your motoring requirements?",
  "Did they explain the relevant benefits (to match your profile)?",
  "Did they perform a walk-around?",
  "Did they offer a test drive?",
  "Did they show pride in their product?",
  "Did they offer alternate models?",
  "Did they introduce you to accessories?",
  "Did they offer to appraise your trade-in?",
  "Did they offer to provide a written quote?"
];

function createMysteryShoppingForm() {
  var form = FormApp.create('Mystery Shopping: Dealership Visit');
  form.setDescription('Complete one form per dealership visit. Answer Yes or No for every question.');
  form.setProgressBar(true);

  form.addTextItem().setTitle('Dealership name').setRequired(true);
  form.addTextItem().setTitle('Delegate or team name');
  form.addDateItem().setTitle('Visit date');

  QUESTIONS.forEach(function (q) {
    if (q.charAt(0) === '#') {
      form.addPageBreakItem().setTitle(q.replace(/^#+\s*/, ''));
      return;
    }
    form.addMultipleChoiceItem()
      .setTitle(q)
      .setChoiceValues(['Yes', 'No'])
      .setRequired(true);
  });

  var sheet = SpreadsheetApp.create('Mystery Shopping: Form Answers');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('1. Send this link to delegates: ' + form.getPublishedUrl());
  Logger.log('2. Edit the form here: ' + form.getEditUrl());
  Logger.log('3. Answers arrive in this Google Sheet: ' + sheet.getUrl());
}
