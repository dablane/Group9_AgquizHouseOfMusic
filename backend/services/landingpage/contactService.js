const contactModel = require('../../models/landingpage/contactModel');
const mailService = require('../admin/mailService');

exports.saveMessage = async ({ name, email, message }) => {
  const clean = {
    name: name.trim().slice(0, 100),
    email: email.trim().toLowerCase().slice(0, 150),
    message: message.trim().slice(0, 2000)
  };
  const id = await contactModel.create(clean);
  await mailService.sendContactMessage(clean);
  return id;
};