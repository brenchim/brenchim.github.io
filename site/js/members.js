// Участники компании. Чтобы добавить человека: положите фото в img/members/ и добавьте строку.
// id менять нельзя — по нему в базе записано, кто что добавил.
export const MEMBERS = [
  { id: 'slava', name: 'Viacheslav', photo: 'img/members/slava.jpg' },
  { id: 'inna', name: 'Inna', photo: 'img/members/inna.jpg' },
  { id: 'annet', name: 'Annet', photo: 'img/members/annet.jpg' },
  { id: 'nadia', name: 'Nadia', photo: 'img/members/nadia.jpg' },
  { id: 'ivan', name: 'Ivan', photo: 'img/members/ivan.jpg' },
  { id: 'oksana', name: 'Oksana', photo: 'img/members/oksana.jpg' },
  { id: 'vitalii', name: 'Vitalii', photo: 'img/members/vitalii.jpg' },
  { id: 'ashot', name: 'Ashot', photo: 'img/members/ashot.jpg' },
];

export const memberById = (id) => MEMBERS.find((m) => m.id === id);
