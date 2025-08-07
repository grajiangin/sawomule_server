const ngrok = require('ngrok');


async function start(){
    await ngrok.authtoken("2uK57KEO6oT4MLIjpZO8C50XXbD_5nigwP6u2DQJSPrbjhJou");
    const url = await ngrok.connect(
        process.env.PORT || 3001,
    
    
      );
}


start();