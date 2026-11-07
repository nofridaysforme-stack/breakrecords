import { frame } from './frame';
import { sendV5 } from './v5';

// v5 fixed to 100% and sent, so the signature request shows as drawn.
frame({ id: '4g', route: '/portal', width: 390, height: 844, before: sendV5 });
