import * as exec from '@actions/exec';

async function getVariable(variableName: string): Promise<string> {
  let variableValue = '';

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        variableValue += data.toString();
      }
    }
  };

  await exec.exec('bash', ['-c', `echo $${variableName}`], options);

  return variableValue.trim();
}

export async function downloadLinuxCpython(version: string): Promise<string> {
  const home = await getVariable('HOME');

  await exec.exec('bash', [
    '-c',
    `
    set -e # Any command which returns non-zero exit code will cause this shell script to exit immediately
    set -x # Activate debugging to show execution details: all commands will be printed before execution
    
    sudo apt-get install build-essential checkinstall
    sudo apt-get install libreadline-gplv2-dev libncursesw5-dev libssl-dev libsqlite3-dev tk-dev libgdbm-dev libc6-dev libbz2-dev

    cd $HOME
    wget https://www.python.org/ftp/python/${version}/Python-${version}.tgz

    tar -xvf Python-${version}.tgz
    cd Python-${version}
    ./configure
    make
    sudo checkinstall -y
    `
  ]);

  return `${home}/Python-${version}`;
}
