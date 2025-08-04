import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';

// 创建本地Tesseract配置
export async function createLocalTesseractWorker() {
  const worker = await createWorker({
    logger: m => console.log(m),
    cachePath: path.join(process.cwd(), 'tessdata'),
    langPath: path.join(process.cwd(), 'tessdata'),
    // 使用本地训练数据，避免网络下载
    workerBlobURL: false,
    workerPath: path.join(process.cwd(), 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    corePath: path.join(process.cwd(), 'node_modules', 'tesseract.js', 'dist', 'tesseract-core.wasm.js')
  });
  
  return worker;
}

// 下载训练数据到本地
export async function downloadTrainingData() {
  const tessDataDir = path.join(process.cwd(), 'tessdata');
  
  if (!fs.existsSync(tessDataDir)) {
    fs.mkdirSync(tessDataDir, { recursive: true });
  }
  
  // 检查是否已有训练数据
  const engFile = path.join(tessDataDir, 'eng.traineddata');
  const chiSimFile = path.join(tessDataDir, 'chi_sim.traineddata');
  
  if (fs.existsSync(engFile) && fs.existsSync(chiSimFile)) {
    console.log('✅ 训练数据已存在');
    return true;
  }
  
  console.log('⚠️ 需要手动下载训练数据');
  return false;
}