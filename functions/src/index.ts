import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-central1' });

export {
  uploadSatCredential,
  startSatDownload,
  advanceSatDownload,
  getSatDownloadJob,
} from './sat/callables';
