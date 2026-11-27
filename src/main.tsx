import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true}}render(){return this.state.failed?<main className="fatal"><h1>화면을 다시 불러올게요.</h1><p>잠시 문제가 생겼습니다. 저장한 링크는 유지됩니다.</p><button onClick={()=>location.reload()}>새로고침</button></main>:this.props.children;}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><App/></Boundary></React.StrictMode>);
