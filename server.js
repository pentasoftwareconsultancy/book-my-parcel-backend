import dotenv from 'dotenv';
import express from 'express';


const app=express();

app.use(express.json());


dotenv.config();

const PORT=process.env.PORT||5000;

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});