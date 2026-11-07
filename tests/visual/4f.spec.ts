import { frame } from './frame';
import { sendV5 } from './v5';

// v5 fixed to 100% and sent, so the signature request shows as drawn.
frame({ id: '4f', route: '/portal', width: 1280, height: 820, before: sendV5 });
