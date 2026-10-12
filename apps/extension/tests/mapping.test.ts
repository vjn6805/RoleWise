import {describe,expect,it} from 'vitest';
import type {Career,Entry} from '@career/shared';
import {propose} from '../src/mapping';
import type {PageField} from '../src/page';
const entry=(label:string,extra:Partial<Entry>={}):Entry=>({id:label,label,organization:'',description:'',startDate:'',endDate:'',url:'',position:0,createdAt:'',updatedAt:'',source:'user',verified:true,...extra});
const career:Career={profile:{fullName:'Alex River',email:'alex@example.test',phone:'+12345',headline:'Engineer',summary:'Built a tool.',location:'London'},sections:{education:[],experience:[],projects:[],skills:[entry('TypeScript')],certifications:[],achievements:[],links:[entry('GitHub',{url:'https://github.com/alex'})]},completeness:70};
const field=(label:string,extra:Partial<PageField>={}):PageField=>({id:'field',label,kind:'text',autocomplete:'',value:'',options:[],...extra});
describe('exact saved-profile mapping',()=>{
  it.each([['Full name','Alex River'],['Email','alex@example.test'],['Phone','+12345'],['Location','London'],['Headline','Engineer'],['Summary','Built a tool.'],['Skills','TypeScript'],['GitHub profile','https://github.com/alex']])('proposes %s from saved data only',(label,value)=>{expect(propose(field(label),career).value).toBe(value);});
  it.each(['First name','Last name','Middle name','Surname','Preferred work location','Years of experience','Notice period','Expected salary','Do you know Rust?'])('does not infer %s',label=>expect(propose(field(label),career).value).toBe(''));
  it('honors exact autocomplete without splitting full names',()=>{expect(propose(field('Contact',{autocomplete:'email'}),career).value).toBe(career.profile.email);expect(propose(field('Name',{autocomplete:'given-name'}),career).value).toBe('');});
  it('only proposes exact case-sensitive select values',()=>{expect(propose(field('Location',{kind:'select',options:['london','Paris']}),career).value).toBe('');expect(propose(field('Location',{kind:'select',options:['London']}),career).value).toBe('London');});
  it('ignores unverified skill entries',()=>{expect(propose(field('Skills'),{...career,sections:{...career.sections,skills:[entry('Rust',{verified:false as unknown as true})]}}).value).toBe('');});
  it('does not choose arbitrarily between multiple matching links',()=>{expect(propose(field('GitHub'),{...career,sections:{...career.sections,links:[...career.sections.links,entry('GitHub work',{url:'https://github.com/other'})]}}).value).toBe('');});
  it('never replaces a page value without review or changes profile data',()=>{const before=JSON.stringify(career);const f=field('Full name',{value:'Already typed'});expect(propose(f,career).value).toBe('Alex River');expect(f.value).toBe('Already typed');expect(JSON.stringify(career)).toBe(before);});
});
