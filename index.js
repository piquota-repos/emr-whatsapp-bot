const { google } = require("googleapis");
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const creds = JSON.parse(fs.readFileSync('./google-credentials.json', 'utf8')); // Your service account JSON credentials
const twilio = require('twilio');
const express = require('express');
const bodyParser = require('body-parser');
const { JWT } = require('google-auth-library');
const moment = require('moment');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const accountSid = 'ACc0e381aca09004166dca994984441ab3';
const authToken = '77170645b8530e075b7b8626bef3edc4';
const whatsappNumber = 'whatsapp:+14155238886';
const client = twilio(accountSid, authToken);

// Google Spreadsheet setup
const doc = new GoogleSpreadsheet('1wAiD2D_UmKc68LgkVdTMn1Qh7TcqVbYSU37LWImL9ME'); // Replace with your spreadsheet ID

// Authenticate with the Google Sheets API using service account credentials
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "./google-credentials.json", // Replace with the path to your JSON key file
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/calendar",],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

// Retrieve all data from Sheet1
async function ensureSheetHeaders() {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = "19RLyZ9dKsSkoeq7U62jfhTHagBDkxnMZ1gViyTplYbQ";
    const range = "Sheet1";
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    if (!response.data.values || response.data.values.length === 0) {
      const headers = [["Name", "Age", "Phone Number", "MR No", "Doctor Name", "Date", "Time", "Confirmation Status", "Consultation Status", "Amount", "Amount Paid Status"]];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: headers },
      });
    }
  } catch (error) {
    console.error("Error ensuring sheet headers:", error);
  }
}


      

// State tracking for users
const userState = {};

// Handle incoming WhatsApp messages
app.post('/whatsapp', async (req, res) => {
  console.log("Incoming Message:", req.body);
  const message = req.body.Body.trim().toLowerCase();
  const from = req.body.From.replace('whatsapp:+', '');

  // Initialize user state if not present
  if (!userState[from]) {
    userState[from] = { step: 'start' };
  }

  const userStep = userState[from].step;

  if (userStep === 'start') {
    if (message === 'hi') {
     userState[from].step = 'language';
      sendMessage(from, "Good Day, Thanks for choosing Athreya Retinal Centre.\n\nPlease select your preferred language. Reply with 1 for English and 2 for Thamizh.");
    }
  } else if (userStep === 'language') {
    if (message === '1') {
      userState[from].step = 'service';
      sendMessage(from, "Please choose how we may help you. Reply with:\n1. Out patient Consultation\n2. Surgery / Injections / Lasers\n3. General Enquiry");
    } else if (message === '2') {
      userState[from].step = 'tamizh';
      sendMessage(from, "Under service, can choose English language, Type 'hi' to proceed from the first step.");
    }
  } else if (userStep === 'service') {
    if (message === '1') {
      userState[from].step = 'outpatient';
      sendMessage(from, "Out patient Consultation. Reply with:\n1. New Patient\n2. Old Patient");
    } else if (message === '2') {
      userState[from].step = 'Surgery';
      sendMessage(from, "For Surgical /Injections / Laser Appointments , Please call 9994055738");
    } else if (message === '3') {
      userState[from].step = 'general';
      sendMessage(from, "For General Enquiry , Please call 9994084256");
    }
  } else if (userStep === 'outpatient') {
    if (message === '1') {
    // userState[from].step = 'getdetails';
    // sendMessage(from, "Provide status, MR No' to check your appointment status.");
       userState[from].step = 'newPatient';
    sendMessage(from, "Please enter your details in the following format:\nName, Age, Mobile Number, Appointment Date (dd-mm-yyyy)");
    } else if (message === '2') {
      // Handle Old Patient
    }
  } else if (userStep === 'newPatient') {
    if (message.includes(',')) {
      const [name, age, mobile, date] = message.split(',').map(item => item.trim());

      // Validate the date format and range
      const dateFormat = 'DD-MM-YYYY';
      const dateObj = moment(date, dateFormat, true); // Validate the format

      if (!dateObj.isValid()) {
        sendMessage(from, "Invalid date format. Please provide the appointment date in dd-mm-yyyy format.");
        return;
      }

      // const tomorrow = moment().add(1, 'days');
      // const twoMonthsLater = moment().add(2, 'months');

      // if (dateObj.isBefore(tomorrow) || dateObj.isAfter(twoMonthsLater)) {
      //   sendMessage(from, `Invalid date. Please choose a date between tomorrow (${tomorrow.format(dateFormat)}) and two months from today (${twoMonthsLater.format(dateFormat)}).`);
      //   return;
      // }
      const tomorrow = moment().add(1, 'days');
const sevenDaysLater = moment().add(7, 'days');

if (dateObj.isBefore(tomorrow) || dateObj.isAfter(sevenDaysLater)) {
  sendMessage(from, `Invalid date. Please choose a date between tomorrow (${tomorrow.format(dateFormat)}) and 7 days from today (${sevenDaysLater.format(dateFormat)}).`);
  return;
}
const currentTime = moment();
const cutOffTime = moment().set({ hour: 12, minute: 0, second: 0 });

if (currentTime.isAfter(cutOffTime) && dateObj.isSame(tomorrow, 'day')) {
  sendMessage(from, "It's past 12:00 noon. You can no longer book appointments for tomorrow.");
  return;
}
      userState[from].name = name;
      const mr_no = `MR${Math.floor(10000 + Math.random() * 90000)}`;
      userState[from].mr_no = mr_no;
      const patientRowIndex = await storePatientData(name, age, mobile, mr_no, date);
      userState[from].step = 'selectDoctor';
      sendMessage(from, "Please select a doctor. Reply with:\n1 for Dr Sriram Gopal\n2 for Dr Supraja K\n3 for Dr Agnes Sylvia\n4 for Dr Varsha V\n5 for Dr GaneshKumar\n6 for Dr Rahul V\n7 for Dr Vinoth M A");
    }
  } else if (userStep === 'selectDoctor') {
    let doctor;
    switch (message) {
      case '1':
        doctor = 'Dr Sriram Gopal';
        break;
      case '2':
        doctor = 'Dr Supraja K';
        break;
      case '3':
        doctor = 'Dr Agnes Sylvia';
        break;
      case '4':
        doctor = 'Dr Varsha V';
        break;
      case '5':
        doctor = 'Dr GaneshKumar';
        break;
      case '6':
        doctor = 'Dr Rahul V';
        break;
      case '7':
        doctor = 'Dr Vinoth M A';
        break;
      default:
        sendMessage(from, "Invalid doctor selection. Please reply with the number corresponding to the doctor.");
        return;
    }

    // Store the doctor and proceed to the time slot selection
    userState[from].doctor = doctor;
    userState[from].step = 'appointmentTime';
    sendMessage(from, "Please choose a time slot. Reply with:\n1 for 9 AM\n2 for 10 AM");
  } else if (userStep === 'appointmentTime') {
    let timeSlot;
    if (message === '1') {
      timeSlot = '9 AM';
    } else if (message === '2') {
      timeSlot = '10 AM';
    }

    if (timeSlot) {
      userState[from].time = timeSlot; // Store the selected time
      userState[from].step = 'confirmation';
      sendMessage(from, "Please confirm your appointment. Type 'yes' to confirm or 'no' to cancel.");
    } else {
      sendMessage(from, "Invalid time slot. Please choose 1 for 9 AM or 2 for 10 AM.");
    }
  } else if (userStep === 'confirmation') {
    if (message === 'yes') {
      const patientData = userState[from];
      await updateAppointmentWithDoctor(patientData.name, patientData.mr_no, patientData.date, patientData.time, patientData.doctor, true);
      sendMessage(from, "Your appointment has been confirmed with the selected doctor.");
       userState[from].step = 'getdetails';
     sendMessage(from, "Provide status, MR No' to check your appointment status.");
    } else if (message === 'no') {
      sendMessage(from, "Appointment has been cancelled. Type 'hi' to restart.");
    }
  } else if (userStep === 'getdetails') {
   // sendMessage(from, "Provide status, MR No' to check your appointment status.");
   if (message.startsWith('status')) {
    // Expected format: "status, MR12345"
    const parts = req.body.Body.split(',');
    if (parts.length < 2) {
      sendMessage(from, "Invalid format. Please send as: status, MR No");
    } else {
      const mr_no = parts[1].trim();
      //await checkAppointment(mr_no);
      const patientData = await getAppointmentDetails(mr_no);
      if (patientData) {
        // Construct a response message using the retrieved data
        // Assuming patientData structure: [name, age, mobile, mr_no, status]
        const responseText = `Patient Details:
Name: ${patientData[0]}
Age: ${patientData[1]}
Mobile: ${patientData[2]}
MR No: ${patientData[3]}
Doctor: ${patientData[4]}
Date: ${patientData[5]}
Time: ${patientData[6]}
Confirmation status: ${patientData[7]}
Consultation status: ${patientData[8]}
`;
        sendMessage(from, responseText);
      } else {
        sendMessage(from, "No records found for the provided MR No.");
      }
    }
  }
  }

 // res.sendStatus(200).end();
});


async function storePatientData(name, age, mobile, mr_no, date) {
  try {
    await ensureSheetHeaders(); // Ensure headers are in place

    const sheets = await getSheetsClient();
    const spreadsheetId = "19RLyZ9dKsSkoeq7U62jfhTHagBDkxnMZ1gViyTplYbQ";
    const range = "Sheet1";

    // Prepare the new row with patient's initial data and appointment date
    const values = [[name, age, mobile, mr_no, '', date, '', 'Pending', 'No', '', 'Unpaid']];
    
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    console.log("Patient Data Append Response:", response);

    // Get the row index where this patient data was added
    const newRowIndex = response.data.updates.updatedRange.split('!')[1].replace(/\D/g, '');
    
    return newRowIndex; // Return row index for later use
  } catch (error) {
    console.error("Error storing data in Google Sheets:", error);
  }
}

async function updateAppointmentWithDoctor(name, mr_no, date, time, doctor, isConfirmed) {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = "19RLyZ9dKsSkoeq7U62jfhTHagBDkxnMZ1gViyTplYbQ"; // Your spreadsheet ID
    const range = "Sheet1"; // Adjust the range as needed

    // Fetch all rows to find the correct one based on Name or Mobile number (you can use MR No too)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    console.log("Rows fetched: ", rows); // Log all rows for debugging

    // Find the patient row based on mobile (or MR No)
    const patientRowIndex = rows.findIndex(row => row[3] && row[3].toLowerCase() === (mr_no ? mr_no.toLowerCase() : ''));

    
    if (patientRowIndex !== -1) {
      console.log(`Found patient at row ${patientRowIndex + 1}`); // Log patient row index
      // Patient found, update the appointment details
      const updateRangeDoctor = `Sheet1!E${patientRowIndex + 1}`; // Assuming 'Doctor' column is I
      const updateRangeTime = `Sheet1!G${patientRowIndex + 1}`; // Assuming 'Date' column is F
      const updateRangeConfirmation = `Sheet1!H${patientRowIndex + 1}`; // Assuming 'Confirmation Status' column is H
      const updateRangeStatus = `Sheet1!I${patientRowIndex + 1}`; // Assuming 'Consultation Status' column is J

      const updateValuesDoctor = [[doctor]];  // Update selected doctor
      const updateValuesTime = [[time]]; // Update time slot
      const updateValuesConfirmation = [[isConfirmed ? 'Confirmed' : 'Pending']]; // Update status (Confirmed/ Pending)
      const updateValuesStatus = [['Scheduled']]; // Status as "Scheduled" once confirmed

      // Update doctor, date, time, confirmation status, and consultation status
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRangeDoctor,
        valueInputOption: 'USER_ENTERED',
        resource: { values: updateValuesDoctor },
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRangeTime,
        valueInputOption: 'USER_ENTERED',
        resource: { values: updateValuesTime },
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRangeConfirmation,
        valueInputOption: 'USER_ENTERED',
        resource: { values: updateValuesConfirmation },
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRangeStatus,
        valueInputOption: 'USER_ENTERED',
        resource: { values: updateValuesStatus },
      });
     // const eventLink = await createCalendarEvent(name, date, time, doctor);
      sendMessage(from, `Your appointment has been confirmed with ${doctor} on ${date} at ${time}. Here is your calendar event: ${eventLink}`);

      console.log("Appointment updated successfully for patient:", name);
    } else {
      console.log(`Patient with mobile ${mobile} not found in the sheet.`);
    }
  } catch (error) {
    console.error("Error updating appointment:", error);
  }
}

async function createCalendarEvent(name, date, time, doctor) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: "./google-credentials.json", // Path to your service account JSON file
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: "v3", auth: authClient });

    const eventStartTime = moment(`${date} ${time}`, "DD-MM-YYYY hh A").toISOString();
    const eventEndTime = moment(eventStartTime).add(30, 'minutes').toISOString();

    const event = {
      summary: `Appointment - ${name} with ${doctor}`,
      description: `Patient ${name} has an appointment with ${doctor} on ${date} at ${time}.`,
      start: { dateTime: eventStartTime, timeZone: "Asia/Kolkata" },
      end: { dateTime: eventEndTime, timeZone: "Asia/Kolkata" },
      reminders: {
        useDefault: false,
        overrides: [{ method: "email", minutes: 60 }, { method: "popup", minutes: 30 }],
      },
    };

    const calendarId = "primary"; // Use your Google Calendar ID
    const response = await calendar.events.insert({
      calendarId,
      resource: event,
    });

    console.log("Calendar Event Created:", response.data);
    return response.data.htmlLink; // Return event link

  } catch (error) {
    console.error("Error creating calendar event:", error);
  }
}


async function confirmAppointment(from) {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = "19RLyZ9dKsSkoeq7U62jfhTHagBDkxnMZ1gViyTplYbQ";
    const range = "Sheet1";
    const values = [["Confirmed", "Yes", "", "Paid"]];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  } catch (error) {
    console.error("Error confirming appointment:", error);
  }
}
// async function checkAppointment(mrno) {
//   const details = await getAppointmentDetails(mrno);
//   if (details) {
//     console.log("Appointment Details:", details);
//   } else {
//     console.log("No appointment found.");
//   }
// }

async function getAppointmentDetails(mrno) {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = "19RLyZ9dKsSkoeq7U62jfhTHagBDkxnMZ1gViyTplYbQ";
    const range = "Sheet1"; // Adjust range as needed
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log("No data found.");
      return null;
    }

    // Find the row with the given MRNO
    const appointment = rows.find(row => row[3] && row[3].toLowerCase() === mrno.toLowerCase());
    if (!appointment) {
      console.log("Appointment not found for MRNO:", mrno);
      return null;
    }

    // const [_, name, date, time, status] = appointment;
    // console.log(`Appointment found: ${name} on ${date} at ${time} - Status: ${status}`);

    // If appointment is confirmed, create a calendar event
    // if (status.toLowerCase() === "confirmed") {
    //   const eventLink = await createCalendarEvent(name, date, time);
    //   return { name, date, time, status, eventLink };
    // }

    return appointment;

  } catch (error) {
    console.error("Error fetching appointment details:", error);
  }
}
// Send WhatsApp Message
function sendMessage(to, text) {
  client.messages.create({
    from: whatsappNumber,
    body: text,
    // body: " ", 
    // interactive: interactiveMessage,
    to: `whatsapp:${+919944281715}` // Use dynamic number from the incoming message
  }).then(msg => console.log("Message Sent:", msg.sid))
    .catch(err => console.error("Twilio Error:", err));
}

// Get patient data filtered by MR No.
async function getPatientDataByMRNo(mr_no) {
  const rows = await accessSheetData();
  if (!rows) return null;

  // If your sheet includes a header row, you may want to skip it:
  // const dataRows = rows.slice(1);
  const dataRows = rows; // Assuming no header row

  // Assuming MR No is the fourth column (index 3)
  const foundRow = dataRows.find(row => row[3] && row[3].toLowerCase() === mr_no.toLowerCase());
  return foundRow;
}


// Optional: Function to get data from the sheet (for debugging or other purposes)
async function accessSheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: "./google-credentials.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    
    const spreadsheetId = "19RLyZ9dKsSkoeq7U62jfhTHagBDkxnMZ1gViyTplYbQ"; // Your spreadsheet ID
    const range = "Sheet1"; // Adjust as needed
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    console.log("Sheet Data:", response.data.values);
    return response.data.values;
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);
    return null;
  }
}

// Start Server
app.listen(3000, () => console.log('Server running on port 3000'));
