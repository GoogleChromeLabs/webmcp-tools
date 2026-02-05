/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const form = document.getElementById('reservationForm');
const dialog = document.getElementById('bookingDialog');
const closeBtn = document.getElementById('closeDialogBtn');
const modalDetails = document.getElementById('modalDetails');

let formValidationErrors = []; // Array to collect validation error messages to send back to the Agent.

const dateInput = document.getElementById('date');
const today = new Date().toISOString().split('T')[0];
dateInput.setAttribute('min', today);

form.addEventListener('submit', function (e) {
  e.preventDefault();

  validateForm();

  if (formValidationErrors.length) {
    if (e.agentInvoked) {
      e.respondWith(formValidationErrors);
    }
    return;
  }

  showModal();

  if (e.agentInvoked) {
    e.respondWith(modalDetails.textContent);
  }
});

function showModal() {
  const name = document.getElementById('name').value;
  const time = document.getElementById('time').value;
  const guests = document.querySelector('#guests option:checked').textContent;
  const seating = document.querySelector('#seating option:checked').textContent;

  const dateObj = new Date(document.getElementById('date').value);
  const dateStr = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  modalDetails.innerHTML = `Hello <strong>${name}</strong>,<br> We look forward to welcoming you on:<br><br> <strong>${dateStr}</strong> at <strong>${time}</strong><br> Party of <strong>${guests}</strong> &bull; ${seating}`;
  dialog.showModal();
}

closeBtn.addEventListener('click', () => {
  dialog.close();
  form.reset();
  resetValidationUI();
});

dialog.addEventListener('click', (e) => {
  const rect = dialog.getBoundingClientRect();
  if (
    e.clientY < rect.top ||
    e.clientY > rect.bottom ||
    e.clientX < rect.left ||
    e.clientX > rect.right
  ) {
    dialog.close();
    form.reset();
    resetValidationUI();
  }
});

function resetValidationUI() {
  document.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  document.querySelectorAll('.error-msg').forEach((el) => (el.style.display = 'none'));
}

function validateForm() {
  formValidationErrors = [];

  // Helper: Toggle error styles and collect messages
  function validateField(input, condition) {
    const errorSpan = input.parentElement.querySelector('.error-msg');
    const errorText = errorSpan ? errorSpan.innerText : 'Unknown error';

    if (!condition) {
      input.classList.add('invalid');
      if (errorSpan) errorSpan.style.display = 'block';

      formValidationErrors.push({
        field: input.name,
        value: input.value,
        message: errorText,
      });
    } else {
      input.classList.remove('invalid');
      if (errorSpan) errorSpan.style.display = 'none';
    }
  }

  const nameInput = document.getElementById('name');
  validateField(nameInput, nameInput.value.trim().length >= 2);

  const phoneInput = document.getElementById('phone');
  const digitsOnly = phoneInput.value.replace(/\D/g, '');
  validateField(phoneInput, digitsOnly.length >= 10);

  const inputDate = new Date(dateInput.value);
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  validateField(dateInput, dateInput.value !== '' && inputDate >= currentDate);

  const timeInput = document.getElementById('time');
  validateField(timeInput, timeInput.value !== '');

  const guestsInput = document.getElementById('guests');
  validateField(guestsInput, guestsInput.selectedIndex !== -1);

  const seatingInput = document.getElementById('seating');
  validateField(seatingInput, seatingInput.selectedIndex !== -1);
}

window.addEventListener('toolactivated', ({ toolName }) => {
  if (toolName !== 'book_table_le_petit_bistro') return;
  validateForm();
});
