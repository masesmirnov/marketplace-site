import { startBoard } from './board.js';
import { mark, markVerdicts, mountSketches } from './ink.js';
import { setupNavigation, setupTheme } from './page.js';
import { SKETCHES } from './sketches.js';
import { Stage } from './stage.js';

setupTheme();
setupNavigation();

let board = null;
const share = state => board && board.send(state);

const stage = new Stage(document.getElementById('stage'), share);

board = startBoard({
  lab: state => stage.lab(state),
  restore: data => stage.restore(data)
});

mountSketches(SKETCHES, {
  top: 'market-hero',
  'board-section': 'pencil'
});
mark(document.querySelector('h1 .mark'), 'underline', 700);
markVerdicts();
