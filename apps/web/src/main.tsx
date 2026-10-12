import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(_error:Error,_info:ErrorInfo){/* Do not log potentially private application data. */}render(){return this.state.failed?<main className="auth-page"><h1>Something interrupted the workspace.</h1><p>Your saved information is still on the server. Reload to try again. Unsaved edits may be lost.</p><button className="button" onClick={()=>window.location.reload()}>Reload workspace</button></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><BrowserRouter><App/></BrowserRouter></ErrorBoundary></StrictMode>);
