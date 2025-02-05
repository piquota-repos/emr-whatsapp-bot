require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio Credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = 'whatsapp:+14155238886'; 
const client = twilio(accountSid, authToken);

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',  // Replace with your MySQL password
    database: 'hospital_db'
});

db.connect(err => {
    if (err) console.error('Database connection failed:', err);
    else console.log('Connected to MySQL Database');
});

// Handle Incoming WhatsApp Messages
app.post('/whatsapp', (req, res) => {
    console.log("Incoming Message:", req.body);  // Logs all incoming messages
    const message = req.body.Body.trim().toLowerCase();
    const from = req.body.From.replace('whatsapp:+', '');  // Remove 'whatsapp:+' prefix

    if (message === 'hi') {
        sendMessage(req.body.From, "Welcome to Hospital! Type 'book' to schedule an appointment.");
    } else if (message === 'book') {
        sendMessage(req.body.From, "Send your details as:\nName, Age, Mobile Number, MR No (if available)");
    } else if (message.includes(',')) {
        const [name, age, mobile, mr_no] = message.split(',');
        storePatientData(req.body.From, name.trim(), age.trim(), mobile.trim(), mr_no ? mr_no.trim() : null);
    } else if (message === 'doctors') {
        sendMessage(req.body.From, "Available doctors:\n1. Dr. Sriram Gopal\n2. Dr. Supraja K\n3. Dr. Agnes Sylvia\nReply with the doctor's name.");
    } else if (message.startsWith('dr.')) {
        storeDoctorSelection(req.body.From, message);
    } else if (message === 'confirm') {
        confirmAppointment(req.body.From);
    } else if (message === 'status') {
        checkAppointmentStatus(req.body.From);
    } else {
        sendMessage(req.body.From, "Invalid input. Type 'hi' to start.");
    }
    res.sendStatus(200).end();
});

// Send WhatsApp Message
function sendMessage(to, text) {
    const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    client.messages.create({
        from: whatsappNumber,
        body: text,
        to: recipient
    }).then(msg => console.log("Message Sent:", msg.sid))
      .catch(err => console.error("Twilio Error:", err));
}

// Store Patient Details
function storePatientData(from, name, age, mobile, mr_no) {
    const cleanMobile = from.replace('whatsapp:+', '');  // Use 'from' instead of user-input mobile

    db.query(
        "INSERT INTO appointments (patient_name, age, mobile_number, mr_no) VALUES (?, ?, ?, ?)",
        [name, age, cleanMobile, mr_no],
        (err, result) => {
            if (err) {
                console.error("DB Insert Error:", err);
                sendMessage(from, "Error saving details. Try again.");
            } else {
                sendMessage(from, "Details saved! Now type 'doctors' to select a doctor.");
            }
        }
    );
}

// Store Doctor Selection
function storeDoctorSelection(from, doctor) {
    const userPhone = from.replace('whatsapp:+', '');  // Remove Twilio prefix

    db.query(
        "UPDATE appointments SET doctor_name = ? WHERE mobile_number = ? ORDER BY id DESC LIMIT 1",
        [doctor, userPhone],
        (err, result) => {
            if (err) {
                console.error("DB Update Error:", err);
                sendMessage(from, "Error saving doctor selection. Try again.");
            } else {
                sendMessage(from, "Doctor selected! Reply with 'confirm' to finalize the appointment.");
            }
        }
    );
}

// Confirm Appointment
function confirmAppointment(from) {
    const userPhone = from.replace('whatsapp:+', '');  // Remove Twilio prefix

    db.query(
        "UPDATE appointments SET status = 'Confirmed' WHERE mobile_number = ? ORDER BY id DESC LIMIT 1",
        [userPhone],
        (err, result) => {
            if (err) {
                console.error("DB Update Error:", err);
                sendMessage(from, "Error confirming appointment. Try again.");
            } else {
                if (result.affectedRows > 0) {
                    sendMessage(from, "Appointment confirmed! You will receive a call soon.");
                } else {
                    sendMessage(from, "No pending appointment found for your number.");
                }
            }
        }
    );
}

// Check Appointment Status
function checkAppointmentStatus(from) {
    const userPhone = from.replace('whatsapp:+', '');  // Remove Twilio prefix
    console.log("Fetching appointment for:", userPhone);

    db.query("SELECT * FROM appointments WHERE mobile_number = ? ORDER BY id DESC LIMIT 1", [userPhone], (err, result) => {
        if (err) {
            console.error("DB Fetch Error:", err);
            sendMessage(from, "Error fetching appointment details.");
            return;
        }

        console.log("DB Query Result:", result);

        if (result.length > 0) {
            const appointment = result[0];
            sendMessage(from, `Your appointment with Dr. ${appointment.doctor_name} is scheduled on ${appointment.appointment_date}. Status: ${appointment.status}`);
        } else {
            sendMessage(from, "No appointment found for your number.");
        }
    });
}


// Start Server
app.listen(3000, () => console.log('Server running on port 3000'));
